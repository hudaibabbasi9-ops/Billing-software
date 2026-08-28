"""Persistent storage for BillPro.

Uses PostgreSQL/Supabase when DATABASE_URL is configured. The table is a
single JSONB document so the existing BillPro API can keep its current data
model without a risky full schema migration.
"""
import json
import os

try:
    import psycopg
except ImportError:
    psycopg = None


def _url():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return ""
    if "sslmode=" not in url.lower():
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def enabled():
    return bool(_url())


def _connect():
    if psycopg is None:
        raise RuntimeError("psycopg is missing. Check requirements.txt.")
    url = _url()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is missing. Add your Supabase/PostgreSQL connection string "
            "to Vercel Environment Variables."
        )
    return psycopg.connect(url, connect_timeout=10)


def _ensure_table():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS billpro_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()


def load(default_data, hash_password):
    """Return the persistent state, initializing it on the first request."""
    if not enabled():
        raise RuntimeError(
            "DATABASE_URL is not configured. BillPro production storage requires "
            "a PostgreSQL/Supabase database."
        )

    _ensure_table()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT data FROM billpro_state WHERE id = 1")
            row = cur.fetchone()

    if row:
        data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        for key, value in default_data.items():
            if key not in data:
                data[key] = json.loads(json.dumps(value))
        return data

    data = json.loads(json.dumps(default_data))
    data["users"][0]["password"] = hash_password("admin123")
    save(data)
    return data


def save(data):
    if not enabled():
        raise RuntimeError(
            "DATABASE_URL is not configured. BillPro production storage requires "
            "a PostgreSQL/Supabase database."
        )

    _ensure_table()
    payload = json.dumps(data, ensure_ascii=False)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO billpro_state (id, data, updated_at)
                VALUES (1, %s::jsonb, NOW())
                ON CONFLICT (id) DO UPDATE
                SET data = EXCLUDED.data, updated_at = NOW()
            """, (payload,))
        conn.commit()
