#!/bin/bash
# Runs ON THE SERVER after rsync. Called by CI/CD pipeline.
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()  { echo -e "${RED}[error]${NC} $1" >&2; exit 1; }
step() { echo -e "\n${BLUE}══════ $1 ══════${NC}"; }

PANEL_DIR="/opt/ssh-panel"
VENV="$PANEL_DIR/venv"
BACKEND="$PANEL_DIR/backend"
FRONTEND="$PANEL_DIR/frontend"
LOG_DIR="/var/log/ssh-panel"

# Decode password passed via base64 (handles special chars)
if [ -n "$ADMIN_PASSWORD_B64" ]; then
  ADMIN_PASSWORD=$(echo "$ADMIN_PASSWORD_B64" | base64 -d)
fi

IS_FIRST_INSTALL=false
[ ! -f "$BACKEND/.env" ] && IS_FIRST_INSTALL=true

# ──────────────────────────────────────────────
step "System packages"
# ──────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive

# Only run apt on first install or if packages are missing
need_apt=false
for pkg in python3.11 node nginx iptables; do
  command -v $pkg &>/dev/null || { need_apt=true; break; }
done
command -v npm &>/dev/null || need_apt=true

if $need_apt || $IS_FIRST_INSTALL; then
  log "Installing system packages..."
  apt-get update -qq
  apt-get install -y -qq \
    python3.11 \
    python3.11-venv \
    python3-pip \
    nodejs \
    npm \
    nginx \
    iptables \
    iptables-persistent \
    netfilter-persistent \
    curl \
    wget \
    pgrep \
    iproute2 \
    2>/dev/null
  log "System packages installed"
else
  log "System packages already present, skipping apt"
fi

# ──────────────────────────────────────────────
step "Python virtual environment"
# ──────────────────────────────────────────────
mkdir -p "$LOG_DIR"

if [ ! -d "$VENV" ]; then
  log "Creating Python venv..."
  python3.11 -m venv "$VENV"
fi

log "Installing Python dependencies..."
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet pydantic-settings
"$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
log "Python deps installed"

# ──────────────────────────────────────────────
step "Configuration (.env)"
# ──────────────────────────────────────────────
if $IS_FIRST_INSTALL; then
  log "First install — creating .env..."

  [ -z "$ADMIN_USERNAME" ] && err "ADMIN_USERNAME secret not set in GitHub"
  [ -z "$ADMIN_PASSWORD" ] && err "ADMIN_PASSWORD secret not set in GitHub"

  SECRET_KEY=$(openssl rand -hex 32)

  ADMIN_HASH=$("$VENV/bin/python3" -c "
from passlib.context import CryptContext
ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
import sys
print(ctx.hash(sys.argv[1]))
" "$ADMIN_PASSWORD")

  cat > "$BACKEND/.env" <<EOF
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD_HASH=$ADMIN_HASH
DATABASE_URL=sqlite:///./ssh_panel.db
EOF
  chmod 600 "$BACKEND/.env"
  log ".env created"

else
  log ".env already exists — preserving credentials"

  # Update admin username if changed
  if [ -n "$ADMIN_USERNAME" ]; then
    current=$(grep "^ADMIN_USERNAME=" "$BACKEND/.env" | cut -d= -f2)
    if [ "$current" != "$ADMIN_USERNAME" ]; then
      sed -i "s|^ADMIN_USERNAME=.*|ADMIN_USERNAME=$ADMIN_USERNAME|" "$BACKEND/.env"
      log "Updated ADMIN_USERNAME in .env"
    fi
  fi

  # Update password if provided
  if [ -n "$ADMIN_PASSWORD" ]; then
    NEW_HASH=$("$VENV/bin/python3" -c "
from passlib.context import CryptContext
ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
import sys
print(ctx.hash(sys.argv[1]))
" "$ADMIN_PASSWORD")
    sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$NEW_HASH|" "$BACKEND/.env"
    log "Admin password updated in .env"
  fi
fi

# ──────────────────────────────────────────────
step "Database"
# ──────────────────────────────────────────────
log "Running DB migration / init..."
cd "$BACKEND"
"$VENV/bin/python3" -c "
import sys; sys.path.insert(0, '.')
from database import init_db
init_db()
print('DB ready')
"

# ──────────────────────────────────────────────
step "Frontend build"
# ──────────────────────────────────────────────
log "Installing Node dependencies..."
cd "$FRONTEND"
npm install --silent 2>/dev/null

log "Building frontend..."
VITE_API_URL="" npm run build
log "Frontend built → dist/"

# ──────────────────────────────────────────────
step "Nginx"
# ──────────────────────────────────────────────
if [ ! -f /etc/nginx/sites-available/ssh-panel ]; then
  log "Installing Nginx config..."
  cp "$PANEL_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ssh-panel
  ln -sf /etc/nginx/sites-available/ssh-panel /etc/nginx/sites-enabled/ssh-panel
  rm -f /etc/nginx/sites-enabled/default
else
  log "Refreshing Nginx config..."
  cp "$PANEL_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ssh-panel
fi

nginx -t
systemctl enable nginx
systemctl reload nginx
log "Nginx ready"

# ──────────────────────────────────────────────
step "Systemd service"
# ──────────────────────────────────────────────
log "Installing / updating systemd service..."
cp "$PANEL_DIR/deploy/ssh-panel.service" /etc/systemd/system/ssh-panel.service
systemctl daemon-reload
systemctl enable ssh-panel

# ──────────────────────────────────────────────
step "Sudoers"
# ──────────────────────────────────────────────
if [ ! -f /etc/sudoers.d/ssh-panel ]; then
  log "Writing sudoers rules..."
  cat > /etc/sudoers.d/ssh-panel <<'SUDOERS'
root ALL=(ALL) NOPASSWD: /usr/sbin/useradd
root ALL=(ALL) NOPASSWD: /usr/sbin/userdel
root ALL=(ALL) NOPASSWD: /usr/sbin/usermod
root ALL=(ALL) NOPASSWD: /usr/bin/chpasswd
root ALL=(ALL) NOPASSWD: /usr/bin/chage
root ALL=(ALL) NOPASSWD: /sbin/iptables
root ALL=(ALL) NOPASSWD: /usr/sbin/iptables
root ALL=(ALL) NOPASSWD: /bin/kill
root ALL=(ALL) NOPASSWD: /usr/bin/kill
root ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/security/limits.d/*.conf
root ALL=(ALL) NOPASSWD: /bin/rm -f /etc/security/limits.d/*.conf
SUDOERS
  chmod 440 /etc/sudoers.d/ssh-panel
  log "Sudoers configured"
fi

# ──────────────────────────────────────────────
step "Start service"
# ──────────────────────────────────────────────
if systemctl is-active --quiet ssh-panel; then
  log "Restarting ssh-panel..."
  systemctl restart ssh-panel
else
  log "Starting ssh-panel..."
  systemctl start ssh-panel
fi

# Save iptables rules
netfilter-persistent save 2>/dev/null || true

# ──────────────────────────────────────────────
sleep 2
if systemctl is-active --quiet ssh-panel; then
  SERVER_IP=$(hostname -I | awk '{print $1}')
  echo ""
  log "════════════════════════════════════"
  log "  Deployment successful!"
  log "  URL: http://${APP_URL:-$SERVER_IP}"
  log "════════════════════════════════════"
else
  err "Service failed to start. Run: journalctl -u ssh-panel -n 50"
fi
