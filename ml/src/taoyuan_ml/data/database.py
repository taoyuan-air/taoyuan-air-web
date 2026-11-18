"""Use FastAPI-compatible PostgreSQL URLs through a synchronous ML connection.

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""
from contextlib import contextmanager


@contextmanager
def connect():
    import psycopg2
    from taoyuan_ml.settings import DATABASE_URL
    if not DATABASE_URL:
        raise ValueError('DATABASE_URL is missing. Configure ml/.env or use --env-file backend/.env.')
    url = DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://', 1)
    if not url.startswith(('postgresql://', 'postgres://')):
        raise ValueError('DATABASE_URL must be a PostgreSQL URL.')
    conn = psycopg2.connect(url)
    try:
        yield conn
    finally:
        conn.close()
