from typing import List
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_admin
from services import session_limiter
from sqlmodel import Session, select
from database import get_session
from models import SSHUser

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def get_all_sessions(_: str = Depends(get_current_admin)):
    return session_limiter.get_active_sessions()


@router.get("/{username}")
async def get_user_sessions(
    username: str,
    _: str = Depends(get_current_admin),
):
    return session_limiter.get_active_sessions(username)


@router.delete("/{pid}", status_code=200)
async def kill_session(
    pid: int,
    _: str = Depends(get_current_admin),
):
    try:
        session_limiter.kill_session(pid)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    return {"message": f"Session PID {pid} terminated"}


@router.post("/enforce")
async def enforce_limits(
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    users = db.exec(select(SSHUser).where(SSHUser.is_active == True)).all()
    user_list = [{"username": u.username, "max_connections": u.max_connections} for u in users]
    killed = session_limiter.enforce_max_connections(user_list)
    return {"message": f"Enforced limits. Killed {killed} excess sessions."}
