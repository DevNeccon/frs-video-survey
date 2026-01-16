from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import engine, Base
from app.api.surveys import router as surveys_router
from app.api.submissions import router as submissions_router

app = FastAPI(title="FRS Video Survey API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(surveys_router)
app.include_router(submissions_router)

@app.get("/health")
def health():
    return {"ok": True}
