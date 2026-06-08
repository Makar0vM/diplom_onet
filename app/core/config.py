from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(url: str) -> str:
    # Railway и другие PaaS отдают postgresql:// — явно указываем драйвер psycopg2.
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url.removeprefix("postgresql://")
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/app.db"

    @property
    def database_url_normalized(self) -> str:
        return _normalize_database_url(self.database_url)


settings = Settings()
