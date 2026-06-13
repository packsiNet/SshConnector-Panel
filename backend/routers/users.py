import re
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database import get_session
from models import SSHUser, SSHUserCreate, SSHUserUpdate, SSHUserRead, ChangePasswordRequest
from auth import get_current_admin, hash_password
from services import ssh_manager, traffic_monitor, session_limiter

router = APIRouter(prefix="/api/users", tags=["users"])

USERNAME_RE = re.compile(r'^[a-z][a-z0-9_]{2,31}$')


def _enrich(user: SSHUser, db: Session) -> dict:
    traffic = traffic_monitor.get_user_bytes(user.username)
    sessions = session_limiter.get_active_sessions(user.username)
    return {
        **user.dict(),
        "active_sessions": len(sessions),
        "rx_bytes": traffic["rx"],
        "tx_bytes": traffic["tx"],
    }


@router.get("", response_model=List[dict])
async def list_users(
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    users = db.exec(select(SSHUser)).all()
    return [_enrich(u, db) for u in users]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: SSHUserCreate,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    if not USERNAME_RE.match(body.username):
        raise HTTPException(400, "Invalid username. Use [a-z][a-z0-9_]{2,31}")

    existing = db.exec(select(SSHUser).where(SSHUser.username == body.username)).first()
    if existing:
        raise HTTPException(409, f"User '{body.username}' already exists in DB")

    expire_date: Optional[date] = None
    if body.expire_days > 0:
        expire_date = date.today() + timedelta(days=body.expire_days)

    try:
        ssh_manager.create_user(body.username, body.password, expire_date=expire_date)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e))

    quota_bytes = int(body.quota_gb * 1024 * 1024 * 1024)
    db_user = SSHUser(
        username=body.username,
        password_hash=hash_password(body.password),
        max_connections=body.max_connections,
        quota_bytes=quota_bytes,
        expire_date=expire_date,
        note=body.note,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    try:
        traffic_monitor.setup_user_chain(body.username)
        session_limiter.setup_pam_limits(body.username, body.max_connections)
    except Exception:
        pass

    return _enrich(db_user, db)


@router.get("/{user_id}")
async def get_user(
    user_id: int,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return _enrich(user, db)


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    body: SSHUserUpdate,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if body.quota_gb is not None:
        user.quota_bytes = int(body.quota_gb * 1024 * 1024 * 1024)
    if body.max_connections is not None:
        user.max_connections = body.max_connections
        try:
            session_limiter.setup_pam_limits(user.username, body.max_connections)
        except Exception:
            pass
    if body.expire_days is not None:
        if body.expire_days > 0:
            user.expire_date = date.today() + timedelta(days=body.expire_days)
            try:
                ssh_manager.set_expiry(user.username, user.expire_date)
            except Exception:
                pass
        else:
            user.expire_date = None
            try:
                ssh_manager.set_expiry(user.username, None)
            except Exception:
                pass
    if body.note is not None:
        user.note = body.note
    if body.is_active is not None:
        user.is_active = body.is_active
        try:
            if body.is_active:
                ssh_manager.unlock_user(user.username)
            else:
                ssh_manager.lock_user(user.username)
        except Exception:
            pass

    db.add(user)
    db.commit()
    db.refresh(user)
    return _enrich(user, db)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    try:
        traffic_monitor.teardown_user_chain(user.username)
        session_limiter.remove_pam_limits(user.username)
        ssh_manager.delete_user(user.username)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    db.delete(user)
    db.commit()


@router.post("/{user_id}/lock")
async def lock_user(
    user_id: int,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    try:
        ssh_manager.lock_user(user.username)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    user.is_active = False
    db.add(user)
    db.commit()
    return {"message": f"User '{user.username}' locked"}


@router.post("/{user_id}/unlock")
async def unlock_user(
    user_id: int,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if user.expire_date and user.expire_date < date.today():
        raise HTTPException(400, "User account is expired")
    if user.quota_bytes > 0 and user.used_bytes >= user.quota_bytes:
        raise HTTPException(400, "User has exceeded data quota")

    try:
        ssh_manager.unlock_user(user.username)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    user.is_active = True
    db.add(user)
    db.commit()
    return {"message": f"User '{user.username}' unlocked"}


@router.post("/{user_id}/reset-traffic")
async def reset_traffic(
    user_id: int,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    traffic_monitor.reset_user_traffic(user.username)
    user.used_bytes = 0
    db.add(user)
    db.commit()
    return {"message": f"Traffic reset for '{user.username}'"}


@router.post("/{user_id}/change-password")
async def change_password(
    user_id: int,
    body: ChangePasswordRequest,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.get(SSHUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    try:
        ssh_manager.change_password(user.username, body.new_password)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    db.commit()
    return {"message": f"Password changed for '{user.username}'"}
