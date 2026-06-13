from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from auth import get_current_admin
from services import traffic_monitor
from database import get_session
from models import SSHUser

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


@router.get("")
async def get_all_traffic(_: str = Depends(get_current_admin)):
    return traffic_monitor.get_all_traffic()


@router.get("/{username}")
async def get_user_traffic(
    username: str,
    _: str = Depends(get_current_admin),
):
    return traffic_monitor.get_user_bytes(username)


@router.post("/{username}/reset")
async def reset_traffic(
    username: str,
    db: Session = Depends(get_session),
    _: str = Depends(get_current_admin),
):
    user = db.exec(select(SSHUser).where(SSHUser.username == username)).first()
    if not user:
        raise HTTPException(404, "User not found")
    traffic_monitor.reset_user_traffic(username)
    user.used_bytes = 0
    db.add(user)
    db.commit()
    return {"message": f"Traffic reset for '{username}'"}
