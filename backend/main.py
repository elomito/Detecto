from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from models.record import StorageError, init_db
from routes import detect, health, history
from utils.logging_config import setup_logging


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger = setup_logging()
    try:
        init_db()
    except StorageError as exc:
        logger.error("Database initialization failed: %s", exc)
        raise
    logger.info("Detecto API ready (CORS origins=%s)", CORS_ORIGINS)
    yield


app = FastAPI(title="Detecto API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(detect.router)
app.include_router(history.router)


@app.get("/")
def root():
    return {"message": "Detecto API"}


