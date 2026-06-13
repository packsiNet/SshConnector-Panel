import os
from fastapi import APIRouter, HTTPException, status, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from models import LoginRequest, TokenResponse, AdminChangePassword
from auth import (
    authenticate_admin,
    create_access_token,
    hash_password,
    get_current_admin,
    verify_password,
)
from config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)
settings = get_settings()


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest):
    if not authenticate_admin(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_access_token({"sub": body.username})
    return TokenResponse(access_token=token)


@router.get("/me")
async def me(current_admin: str = Depends(get_current_admin)):
    return {"username": current_admin}


@router.post("/change-password")
async def change_password(
    body: AdminChangePassword,
    current_admin: str = Depends(get_current_admin),
):
    if not verify_password(body.current_password, settings.ADMIN_PASSWORD_HASH):
        raise HTTPException(status_code=400, detail="Current password incorrect")

    new_hash = hash_password(body.new_password)
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env_path = os.path.abspath(env_path)

    lines = []
    updated = False
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("ADMIN_PASSWORD_HASH="):
                    lines.append(f"ADMIN_PASSWORD_HASH={new_hash}\n")
                    updated = True
                else:
                    lines.append(line)
        if not updated:
            lines.append(f"ADMIN_PASSWORD_HASH={new_hash}\n")
        with open(env_path, "w") as f:
            f.writelines(lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update .env: {e}")

    settings.ADMIN_PASSWORD_HASH = new_hash
    return {"message": "Password updated successfully."}
