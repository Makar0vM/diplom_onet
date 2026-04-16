from pydantic import BaseSettings

class Settings(BaseSettings):
    app_name: str = "AI Credit API"
    database_url: str = "sqlite:///./test.db"

settings = Settings()