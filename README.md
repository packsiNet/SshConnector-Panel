# SSH Panel

Web-based SSH user management panel for Ubuntu 22.04.

## Quick Install

```bash
# On fresh Ubuntu 22.04, as root:
git clone <repo> /tmp/ssh-panel
bash /tmp/ssh-panel/deploy/install.sh
```

Or if you have the files locally:
```bash
sudo bash /path/to/panel/deploy/install.sh
```

## Access

After install: `http://SERVER_IP`

Login with the admin credentials set during install.

## Features

- Create/delete SSH users with shell locked to `/usr/sbin/nologin`
- Per-user data quota (tracked via iptables)
- Max simultaneous sessions enforcement (PAM limits)
- Account expiry dates
- Live session monitoring + kill
- Traffic usage per user
- JWT-authenticated API

## Update Admin Password

Option 1 — via panel UI: Dashboard → top-right menu → Change Password

Option 2 — via CLI:
```bash
cd /opt/ssh-panel/backend
NEW_HASH=$(/opt/ssh-panel/venv/bin/python3 -c "
from passlib.context import CryptContext
ctx = CryptContext(schemes=['bcrypt'])
print(ctx.hash('YOUR_NEW_PASSWORD'))
")
sed -i "s|ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$NEW_HASH|" .env
systemctl restart ssh-panel
```

## Backup Database

```bash
cp /opt/ssh-panel/backend/ssh_panel.db /root/ssh_panel_backup_$(date +%Y%m%d).db
```

## Service Management

```bash
systemctl status ssh-panel      # check status
systemctl restart ssh-panel     # restart
journalctl -u ssh-panel -f      # live logs
tail -f /var/log/ssh-panel/access.log  # access log
```

## Stack

- Backend: Python 3.11 + FastAPI + SQLite
- Frontend: React 18 + Vite + TailwindCSS
- Proxy: Nginx
- Process: Gunicorn + Uvicorn workers
# SshConnector-Panel
