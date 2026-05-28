"""Lightweight SQLite persistence for import metadata."""

import sqlite3
import uuid as uuid_lib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "imports.db"


def get_connection() -> sqlite3.Connection:
    """Return a connection with row_factory enabled."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS recent_imports (
                import_id     TEXT PRIMARY KEY,
                dataset_id    TEXT,
                source_path   TEXT NOT NULL,
                original_path TEXT,
                content_hash  TEXT,
                imported_at   TEXT NOT NULL,
                file_size     INTEGER,
                signal_count  INTEGER,
                dataset_name  TEXT
            )
        """)
        # Migrations for existing databases
        for col, definition in [
            ("content_hash",  "TEXT"),
            ("original_path", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE recent_imports ADD COLUMN {col} {definition}")
            except Exception:
                pass  # column already exists
        conn.commit()


def add_import(
    source_path: str,
    signal_count: int,
    file_size: int = 0,
    dataset_name: str = "",
    dataset_id: Optional[str] = None,
    content_hash: Optional[str] = None,
    original_path: Optional[str] = None,
) -> str:
    """Track a new import in the database. Returns the import_id.

    Deduplication strategy:
    - When content_hash is provided: dedup by hash alone.
      Identical content (same hash) → return existing entry (no duplicate).
      New hash → insert new entry (new version of the file).
    - When content_hash is absent (legacy uploads without hash): fallback dedup
      on source_path (UUID-prefixed uploads never collide anyway).
    """
    with get_connection() as conn:
        if content_hash:
            existing = conn.execute(
                "SELECT import_id FROM recent_imports WHERE content_hash = ?",
                (content_hash,),
            ).fetchone()
        else:
            existing = conn.execute(
                "SELECT import_id FROM recent_imports WHERE source_path = ?",
                (source_path,),
            ).fetchone()

        if existing:
            return existing["import_id"]

        import_id = str(uuid_lib.uuid4())
        imported_at = datetime.utcnow().isoformat() + "Z"
        conn.execute(
            """INSERT INTO recent_imports
               (import_id, dataset_id, source_path, original_path, content_hash,
                imported_at, file_size, signal_count, dataset_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (import_id, dataset_id, source_path, original_path, content_hash,
             imported_at, file_size, signal_count, dataset_name),
        )
        conn.commit()
    return import_id


def get_import_by_hash(content_hash: str) -> Optional[dict]:
    """Return the DB row for a given content hash, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM recent_imports WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
    return dict(row) if row else None


def get_recent_imports(limit: int = 10) -> list:
    """Return the most recent imports sorted by date descending."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM recent_imports ORDER BY imported_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def delete_import(import_id: str) -> bool:
    """Delete a single import entry and its cache file if applicable. Returns True if found."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT source_path FROM recent_imports WHERE import_id = ?",
            (import_id,),
        ).fetchone()
        if row is None:
            return False
        path = Path(row["source_path"])
        try:
            if path.exists() and "import_cache" in str(path):
                path.unlink()
        except Exception:
            pass
        conn.execute("DELETE FROM recent_imports WHERE import_id = ?", (import_id,))
        conn.commit()
    return True


def cleanup_old_imports(max_age_days: int = 14) -> int:
    """Delete DB entries and associated cache files older than max_age_days. Returns number deleted."""
    cutoff = (datetime.utcnow() - timedelta(days=max_age_days)).isoformat() + "Z"
    with get_connection() as conn:
        old_rows = conn.execute(
            "SELECT import_id, source_path FROM recent_imports WHERE imported_at < ?",
            (cutoff,),
        ).fetchall()
        for row in old_rows:
            path = Path(row["source_path"])
            try:
                if path.exists() and "import_cache" in str(path):
                    path.unlink()
            except Exception:
                pass
        count = len(old_rows)
        conn.execute("DELETE FROM recent_imports WHERE imported_at < ?", (cutoff,))
        conn.commit()
    return count
