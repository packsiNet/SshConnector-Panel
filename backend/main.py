import threading
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import init_db, get_session
from routers import auth, users, sessions, traffic
from services import traffic_monitor, session_limiter
from models import SSHUser
from sqlmodel import Session, select
from database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


def background_scheduler():
    while True:
        time.sleep(60)
        try:
            with Session(engine) as db:
                ssh_users = db.exec(select(SSHUser)).all()

                # Update traffic + enforce quotas
                for user in ssh_users:
                    try:
                        t = traffic_monitor.get_user_bytes(user.username)
                        user.used_bytes = t["total"]
                        if traffic_monitor.check_quota(user.username, user.quota_bytes, user.used_bytes):
                            from services.ssh_manager import lock_user
                            lock_user(user.username)
                            user.is_active = False
                            logger.info("Quota exceeded: locked user %s", user.username)
                        db.add(user)
                    except Exception as e:
                        logger.debug("Traffic update for %s: %s", user.username, e)

                db.commit()

                # Enforce max connections
                active_users = [
                    {"username": u.username, "max_connections": u.max_connections}
                    for u in ssh_users
                    if u.is_active
                ]
                killed = session_limiter.enforce_max_connections(active_users)
                if killed:
                    logger.info("Scheduler: killed %d excess sessions", killed)

        except Exception as e:
            logger.error("Scheduler error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")

    with Session(engine) as db:
        existing_users = db.exec(select(SSHUser)).all()
        for user in existing_users:
            try:
                traffic_monitor.setup_user_chain(user.username)
            except Exception:
                pass

    t = threading.Thread(target=background_scheduler, daemon=True)
    t.start()
    logger.info("Background scheduler started")

    yield


app = FastAPI(
    title="SSH Panel API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(traffic.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/stats")
async def stats():
    with Session(engine) as db:
        all_users = db.exec(select(SSHUser)).all()
        total = len(all_users)
        active = sum(1 for u in all_users if u.is_active)
        total_traffic = sum(u.used_bytes for u in all_users)
        sessions = session_limiter.get_active_sessions()
        return {
            "total_users": total,
            "active_users": active,
            "total_traffic_bytes": total_traffic,
            "active_sessions": len(sessions),
        }
