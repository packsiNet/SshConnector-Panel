import subprocess
import re
import logging
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def get_active_sessions(username: Optional[str] = None) -> List[Dict]:
    sessions = []
    try:
        r = subprocess.run(
            ["who", "-u"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        who_re = re.compile(
            r'^(\S+)\s+\S+\s+(\S+\s+\S+)\s+\S+\s+\((\S+)\)'
        )
        for line in r.stdout.splitlines():
            m = who_re.match(line)
            if not m:
                continue
            uname, login_time_str, ip = m.group(1), m.group(2), m.group(3)
            if username and uname != username:
                continue
            sessions.append({
                "username": uname,
                "ip": ip,
                "login_time": login_time_str,
                "duration": "",
                "pid": _get_sshd_pid(uname),
            })
    except Exception as e:
        logger.warning("get_active_sessions error: %s", e)

    if not sessions:
        sessions = _parse_ss_sessions(username)

    return sessions


def _get_sshd_pid(username: str) -> int:
    try:
        r = subprocess.run(
            ["pgrep", "-u", username, "sshd"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        pids = r.stdout.strip().split()
        if pids:
            return int(pids[-1])
    except Exception:
        pass
    return 0


def _parse_ss_sessions(username: Optional[str]) -> List[Dict]:
    sessions = []
    try:
        r = subprocess.run(
            ["ss", "-tnp"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        pid_re = re.compile(r'pid=(\d+)')
        for line in r.stdout.splitlines():
            if "sshd" not in line:
                continue
            m = pid_re.search(line)
            pid = int(m.group(1)) if m else 0
            parts = line.split()
            peer = parts[4] if len(parts) > 4 else "unknown"
            ip = peer.rsplit(":", 1)[0].strip("[]") if ":" in peer else peer

            if pid:
                uname = _pid_username(pid)
            else:
                uname = "unknown"

            if username and uname != username:
                continue

            sessions.append({
                "username": uname,
                "ip": ip,
                "login_time": "",
                "duration": "",
                "pid": pid,
            })
    except Exception as e:
        logger.warning("_parse_ss_sessions error: %s", e)
    return sessions


def _pid_username(pid: int) -> str:
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("Uid:"):
                    uid = int(line.split()[1])
                    import pwd
                    return pwd.getpwuid(uid).pw_name
    except Exception:
        pass
    return "unknown"


def get_session_count(username: str) -> int:
    return len(get_active_sessions(username))


def kill_session(pid: int) -> None:
    try:
        subprocess.run(
            ["sudo", "kill", "-HUP", str(pid)],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception as e:
        raise RuntimeError(f"kill -HUP {pid} failed: {e}")


def enforce_max_connections(users: List[Dict]) -> int:
    killed = 0
    for user in users:
        username = user["username"]
        max_conn = user["max_connections"]
        if max_conn <= 0:
            continue
        sessions = get_active_sessions(username)
        if len(sessions) > max_conn:
            excess = sessions[max_conn:]
            for s in excess:
                pid = s.get("pid", 0)
                if pid:
                    try:
                        kill_session(pid)
                        killed += 1
                    except Exception as e:
                        logger.warning("enforce: kill pid %d failed: %s", pid, e)
    return killed


def setup_pam_limits(username: str, max_sessions: int) -> None:
    content = f"{username} hard maxlogins {max_sessions}\n"
    try:
        path = f"/etc/security/limits.d/{username}.conf"
        r = subprocess.run(
            ["sudo", "tee", path],
            input=content,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode != 0:
            logger.warning("setup_pam_limits(%s) failed: %s", username, r.stderr)
    except Exception as e:
        logger.warning("setup_pam_limits(%s) error: %s", username, e)


def remove_pam_limits(username: str) -> None:
    try:
        path = f"/etc/security/limits.d/{username}.conf"
        subprocess.run(
            ["sudo", "rm", "-f", path],
            capture_output=True,
            timeout=5,
        )
    except Exception as e:
        logger.warning("remove_pam_limits(%s) error: %s", username, e)
