from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field


class SSHUser(SQLModel, table=True):
    __tablename__ = "ssh_users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    shell: str = Field(default="/usr/sbin/nologin")
    max_connections: int = Field(default=1)
    quota_bytes: int = Field(default=0)
    used_bytes: int = Field(default=0)
    expire_date: Optional[date] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    note: str = Field(default="")


class SSHUserCreate(SQLModel):
    username: str
    password: str
    max_connections: int = 1
    quota_gb: float = 0
    expire_days: int = 0
    note: str = ""


class SSHUserUpdate(SQLModel):
    max_connections: Optional[int] = None
    quota_gb: Optional[float] = None
    expire_days: Optional[int] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None


class SSHUserRead(SQLModel):
    id: int
    username: str
    shell: str
    max_connections: int
    quota_bytes: int
    used_bytes: int
    expire_date: Optional[date]
    is_active: bool
    created_at: datetime
    note: str
    active_sessions: int = 0
    rx_bytes: int = 0
    tx_bytes: int = 0


class ChangePasswordRequest(SQLModel):
    new_password: str


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(SQLModel):
    username: str
    password: str


class AdminChangePassword(SQLModel):
    current_password: str
    new_password: str
