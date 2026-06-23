from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, user, uav, teds_point

app = FastAPI(title="Taoyuan Air Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(uav.router,  prefix="/api")
app.include_router(teds_point.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
