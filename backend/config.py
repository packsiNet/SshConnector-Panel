import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "insecure-default-key-change-me")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD_HASH: str = os.getenv("ADMIN_PASSWORD_HASH", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ssh_panel.db")

    def reload(self):
        load_dotenv(override=True)
        self.SECRET_KEY = os.getenv("SECRET_KEY", self.SECRET_KEY)
        self.ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", self.ADMIN_USERNAME)
        self.ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", self.ADMIN_PASSWORD_HASH)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
