import subprocess
import pwd
import logging
import re
from typing import Dict

logger = logging.getLogger(__name__)


def _run_iptables(args: list) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["sudo", "iptables"] + args,
        capture_output=True,
        text=True,
        timeout=15,
    )


def _get_uid(username: str) -> int:
    return pwd.getpwnam(username).pw_uid


def setup_user_chain(username: str) -> None:
    try:
        uid = _get_uid(username)
        chain = f"ssh_user_{uid}"

        r = _run_iptables(["-N", chain])
        if r.returncode not in (0, 1):
            logger.warning("iptables -N %s: %s", chain, r.stderr.strip())

        _run_iptables(["-A", chain, "-j", "RETURN"])
        _run_iptables([
            "-A", "OUTPUT", "-m", "owner",
            "--uid-owner", str(uid), "-j", chain
        ])
        _run_iptables([
            "-A", "INPUT", "-m", "owner",
            "--uid-owner", str(uid), "-j", chain
        ])
    except Exception as e:
        logger.warning("setup_user_chain(%s) failed: %s", username, e)


def teardown_user_chain(username: str) -> None:
    try:
        uid = _get_uid(username)
    except KeyError:
        return

    chain = f"ssh_user_{uid}"
    try:
        _run_iptables(["-D", "OUTPUT", "-m", "owner", "--uid-owner", str(uid), "-j", chain])
        _run_iptables(["-D", "INPUT", "-m", "owner", "--uid-owner", str(uid), "-j", chain])
        _run_iptables(["-F", chain])
        _run_iptables(["-X", chain])
    except Exception as e:
        logger.warning("teardown_user_chain(%s) failed: %s", username, e)


def _parse_bytes_from_chain(chain: str) -> int:
    r = _run_iptables(["-L", chain, "-v", "-n", "--line-numbers"])
    if r.returncode != 0:
        return 0
    total = 0
    for line in r.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            num = int(parts[0])
            raw = parts[1]
            if raw.endswith("K"):
                total += int(float(raw[:-1]) * 1024)
            elif raw.endswith("M"):
                total += int(float(raw[:-1]) * 1024 * 1024)
            elif raw.endswith("G"):
                total += int(float(raw[:-1]) * 1024 * 1024 * 1024)
            else:
                total += int(raw)
        except (ValueError, IndexError):
            continue
    return total


def get_user_bytes(username: str) -> Dict[str, int]:
    try:
        uid = _get_uid(username)
        chain = f"ssh_user_{uid}"
        total = _parse_bytes_from_chain(chain)
        return {"rx": 0, "tx": total, "total": total}
    except Exception as e:
        logger.debug("get_user_bytes(%s) failed: %s", username, e)
        return {"rx": 0, "tx": 0, "total": 0}


def reset_user_traffic(username: str) -> None:
    try:
        uid = _get_uid(username)
        chain = f"ssh_user_{uid}"
        _run_iptables(["-Z", chain])
    except Exception as e:
        logger.warning("reset_user_traffic(%s) failed: %s", username, e)


def get_all_traffic() -> Dict[str, Dict[str, int]]:
    result: Dict[str, Dict[str, int]] = {}
    try:
        r = _run_iptables(["-L", "-v", "-n"])
        if r.returncode != 0:
            return result
        pattern = re.compile(r'ssh_user_(\d+)')
        chains_seen = set()
        for line in r.stdout.splitlines():
            m = pattern.search(line)
            if m:
                chains_seen.add(m.group(0))
        for chain in chains_seen:
            uid_str = chain.replace("ssh_user_", "")
            try:
                uid = int(uid_str)
                import pwd as _pwd
                username = _pwd.getpwuid(uid).pw_name
                total = _parse_bytes_from_chain(chain)
                result[username] = {"rx": 0, "tx": total, "total": total}
            except Exception:
                pass
    except Exception as e:
        logger.warning("get_all_traffic failed: %s", e)
    return result


def check_quota(username: str, quota_bytes: int, used_bytes: int) -> bool:
    if quota_bytes <= 0:
        return False
    return used_bytes >= quota_bytes
