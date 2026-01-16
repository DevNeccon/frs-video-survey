from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    media_dir: str = "/app/media"
    public_base_url: str = "http://localhost:8000"
    geolookup_provider: str = "ipapi"  # ipapi | ip-api | none

settings = Settings()
