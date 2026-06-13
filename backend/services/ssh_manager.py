import subprocess
import pwd
import logging
import re
from datetime import date
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)

USERNAME_RE = re.compile(r'^[a-z][a-z0-9_]{2,31}$')


def _run(cmd: list) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["sudo"] + cmd,
        capture_output=True,
        text=True,
        timeout=30,
    )


def validate_username(username: str):
    if not USERNAME_RE.match(username):
        raise ValueError(f"Invalid username '{username}'. Must match [a-z][a-z0-9_]{{2,31}}")


def user_exists_system(username: str) -> bool:
    try:
        pwd.getpwnam(username)
        return True
    except KeyError:
        return False


def create_user(username: str, password: str, shell: str = "/usr/sbin/nologin",
                expire_date: Optional[date] = None) -> None:
    validate_username(username)
    if user_exists_system(username):
        raise ValueError(f"System user '{username}' already exists")

    cmd = ["useradd", "-m", "-s", shell]
    if expire_date:
        cmd += ["-e", expire_date.strftime("%Y-%m-%d")]
    cmd.append(username)

    r = _run(cmd)
    if r.returncode != 0:
        raise RuntimeError(f"useradd failed: {r.stderr.strip()}")

    r2 = subprocess.run(
        ["sudo", "chpasswd"],
        input=f"{username}:{password}",
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r2.returncode != 0:
        _run(["userdel", "-r", username])
        raise RuntimeError(f"chpasswd failed: {r2.stderr.strip()}")


def delete_user(username: str) -> None:
    if not user_exists_system(username):
        logger.warning("delete_user: '%s' not in system, skipping", username)
        return
    r = _run(["userdel", "-r", username])
    if r.returncode != 0:
        raise RuntimeError(f"userdel failed: {r.stderr.strip()}")


def lock_user(username: str) -> None:
    r = _run(["usermod", "-L", username])
    if r.returncode != 0:
        raise RuntimeError(f"usermod -L failed: {r.stderr.strip()}")


def unlock_user(username: str) -> None:
    r = _run(["usermod", "-U", username])
    if r.returncode != 0:
        raise RuntimeError(f"usermod -U failed: {r.stderr.strip()}")


def change_password(username: str, new_password: str) -> None:
    r = subprocess.run(
        ["sudo", "chpasswd"],
        input=f"{username}:{new_password}",
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        raise RuntimeError(f"chpasswd failed: {r.stderr.strip()}")


def set_expiry(username: str, expire_date: Optional[date]) -> None:
    if expire_date:
        r = _run(["chage", "-E", expire_date.strftime("%Y-%m-%d"), username])
    else:
        r = _run(["chage", "-E", "-1", username])
    if r.returncode != 0:
        raise RuntimeError(f"chage failed: {r.stderr.strip()}")


def list_system_users() -> List[Dict]:
    users = []
    try:
        with open("/etc/passwd") as f:
            for line in f:
                parts = line.strip().split(":")
                if len(parts) < 7:
                    continue
                uid = int(parts[2])
                if uid >= 1000 and parts[0] != "nobody":
                    users.append({
                        "username": parts[0],
                        "uid": uid,
                        "home": parts[5],
                        "shell": parts[6],
                    })
    except Exception as e:
        logger.error("list_system_users error: %s", e)
    return users
