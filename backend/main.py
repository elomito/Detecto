from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import health

app = FastAPI(title="Detecto API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.get("/")
def root():
    return {"message": "Detecto API"}
