#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[x]${NC} $1" >&2; exit 1; }

# 1. Root check
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash install.sh"

PANEL_DIR="/opt/ssh-panel"
LOG_DIR="/var/log/ssh-panel"

log "Installing SSH Panel..."
log "Target: $PANEL_DIR"

# 2. System dependencies
log "Updating packages..."
apt-get update -qq
apt-get install -y -qq \
    python3.11 python3.11-venv python3-pip \
    nodejs npm \
    nginx \
    iptables iptables-persistent \
    curl wget \
    2>/dev/null

# 3. Create directories
log "Creating directories..."
mkdir -p "$PANEL_DIR"
mkdir -p "$LOG_DIR"

# 4. Copy project files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log "Copying project files from $PROJECT_DIR..."
cp -r "$PROJECT_DIR/backend" "$PANEL_DIR/"
cp -r "$PROJECT_DIR/frontend" "$PANEL_DIR/"

# 5. Python venv
log "Setting up Python virtual environment..."
python3.11 -m venv "$PANEL_DIR/venv"
"$PANEL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$PANEL_DIR/venv/bin/pip" install --quiet -r "$PANEL_DIR/backend/requirements.txt"

# Handle pydantic-settings (required for config.py)
"$PANEL_DIR/venv/bin/pip" install --quiet pydantic-settings 2>/dev/null || true

# 6. Generate .env
log "Generating configuration..."
SECRET_KEY=$(openssl rand -hex 32)

# Non-interactive mode: use env vars ADMIN_USERNAME / ADMIN_PASSWORD
# Decode base64 password if passed via CI/CD
if [ -n "$ADMIN_PASSWORD_B64" ]; then
    ADMIN_PASSWORD=$(echo "$ADMIN_PASSWORD_B64" | base64 -d)
fi

if [ -n "$ADMIN_USERNAME" ] && [ -n "$ADMIN_PASSWORD" ]; then
    log "Using credentials from environment (non-interactive)"
    ADMIN_USER="$ADMIN_USERNAME"
    ADMIN_PASS="$ADMIN_PASSWORD"
else
    echo -n "Admin username [admin]: "
    read ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}

    while true; do
        echo -n "Admin password: "
        read -s ADMIN_PASS
        echo
        echo -n "Confirm password: "
        read -s ADMIN_PASS2
        echo
        [[ "$ADMIN_PASS" == "$ADMIN_PASS2" ]] && break
        warn "Passwords do not match. Try again."
    done
fi

ADMIN_HASH=$("$PANEL_DIR/venv/bin/python3" -c "
from passlib.context import CryptContext
ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
import sys
print(ctx.hash(sys.argv[1]))
" "$ADMIN_PASS")

cat > "$PANEL_DIR/backend/.env" <<EOF
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD_HASH=$ADMIN_HASH
DATABASE_URL=sqlite:///./ssh_panel.db
EOF
chmod 600 "$PANEL_DIR/backend/.env"
log ".env created"

# 7. Init database
log "Initializing database..."
cd "$PANEL_DIR/backend"
"$PANEL_DIR/venv/bin/python3" -c "
import sys; sys.path.insert(0, '.')
from database import init_db
init_db()
print('DB initialized')
"

# 8. Build frontend
log "Building frontend..."
cd "$PANEL_DIR/frontend"
npm install --silent 2>/dev/null
VITE_API_URL="" npm run build

# 9. Nginx config
log "Configuring Nginx..."
cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ssh-panel
ln -sf /etc/nginx/sites-available/ssh-panel /etc/nginx/sites-enabled/ssh-panel
rm -f /etc/nginx/sites-enabled/default
nginx -t

# 10. Systemd service
log "Installing systemd service..."
cp "$PROJECT_DIR/deploy/ssh-panel.service" /etc/systemd/system/ssh-panel.service
systemctl daemon-reload
systemctl enable ssh-panel
systemctl restart ssh-panel

# 11. Restart nginx
systemctl reload nginx

# 12. Sudoers
log "Configuring sudoers..."
cat > /etc/sudoers.d/ssh-panel <<'SUDOERS'
root ALL=(ALL) NOPASSWD: /usr/sbin/useradd, /usr/sbin/userdel, /usr/sbin/usermod
root ALL=(ALL) NOPASSWD: /usr/bin/chpasswd, /usr/bin/chage
root ALL=(ALL) NOPASSWD: /sbin/iptables, /usr/sbin/iptables
root ALL=(ALL) NOPASSWD: /bin/kill, /usr/bin/kill
root ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/security/limits.d/*.conf
root ALL=(ALL) NOPASSWD: /bin/rm -f /etc/security/limits.d/*.conf
SUDOERS
chmod 440 /etc/sudoers.d/ssh-panel

# 13. Save iptables rules on reboot
log "Configuring iptables persistence..."
netfilter-persistent save 2>/dev/null || true

# 14. Final status
log "Checking service status..."
sleep 2
if systemctl is-active --quiet ssh-panel; then
    log "ssh-panel service: RUNNING"
else
    warn "ssh-panel service not running. Check: journalctl -u ssh-panel -n 50"
fi

SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  SSH Panel installed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  URL:      ${GREEN}http://$SERVER_IP${NC}"
echo -e "  Admin:    ${YELLOW}$ADMIN_USER${NC}"
echo -e "  Logs:     journalctl -u ssh-panel -f"
echo -e "  DB:       $PANEL_DIR/backend/ssh_panel.db"
echo ""
