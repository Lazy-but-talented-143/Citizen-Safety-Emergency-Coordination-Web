"""
Citizen Safety – Demo Database Repair Script
============================================
Idempotent. Safe to run multiple times.

Fixes two known SQLite migration artefacts:

1. accounts_guardian.user_id had a UNIQUE constraint preventing one person
   from being guardian for multiple residents.  Removed by rebuilding the
   table.

2. emergency_emergencyescalation.guardian_id FK pointed to
   accounts_guardian_old (an SQLite table-recreation artefact from
   migration 0009) instead of accounts_guardian.  Fixed by rebuilding the
   escalation table.

NOTE: The legacy misspelled table "emergency_emergencyscalation" is NOT
created here.  Django uses "emergency_emergencyescalation" (with the 'e').
"""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent / "db.sqlite3"


def table_sql(con, name):
    row = con.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row[0] if row else None


def rebuild_guardian(con):
    """Remove the UNIQUE constraint on accounts_guardian.user_id."""
    sql = table_sql(con, "accounts_guardian") or ""
    has_unique = "UNIQUE" in sql.upper() and "user_id" in sql
    if not has_unique:
        print("  accounts_guardian: already correct, skipping.")
        return False

    print("  accounts_guardian: rebuilding to remove UNIQUE on user_id …")
    con.execute("PRAGMA foreign_keys=OFF")
    con.execute("ALTER TABLE accounts_guardian RENAME TO accounts_guardian_old")
    con.execute(
        """
        CREATE TABLE accounts_guardian (
            id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
            name varchar(100) NOT NULL,
            relation varchar(50) NOT NULL,
            phone varchar(15) NOT NULL,
            email varchar(254) NOT NULL DEFAULT '',
            address text NOT NULL DEFAULT '',
            resident_id bigint NOT NULL
                REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED,
            created_at datetime NOT NULL,
            guardian_type varchar(20) NOT NULL,
            is_active bool NOT NULL,
            is_verified bool NOT NULL,
            user_id bigint NULL
                REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED,
            relationship_status varchar(12) NOT NULL DEFAULT 'PENDING',
            requested_by_id bigint NULL
                REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED
        )
        """
    )
    con.execute(
        """
        INSERT INTO accounts_guardian
            (id, name, relation, phone, email, address, resident_id,
             created_at, guardian_type, is_active, is_verified, user_id,
             relationship_status, requested_by_id)
        SELECT id, name, relation, phone,
               COALESCE(email, ''), COALESCE(address, ''),
               resident_id, created_at, guardian_type,
               is_active, is_verified, user_id,
               COALESCE(relationship_status, 'PENDING'),
               requested_by_id
        FROM accounts_guardian_old
        """
    )
    con.execute("DROP TABLE accounts_guardian_old")
    for col, idx in [
        ("resident_id",     "accounts_guardian_resident_id_idx"),
        ("user_id",         "accounts_guardian_user_id_idx"),
        ("requested_by_id", "accounts_guardian_requested_by_id_idx"),
    ]:
        con.execute(
            f"CREATE INDEX IF NOT EXISTS {idx} "
            f"ON accounts_guardian({col})"
        )
    con.execute("PRAGMA foreign_keys=ON")
    print("  accounts_guardian: rebuild complete.")
    return True


def fix_escalation_fk(con):
    """Fix emergency_emergencyescalation.guardian_id FK if it points to _old."""
    sql = table_sql(con, "emergency_emergencyescalation") or ""
    if not sql:
        print("  emergency_emergencyescalation: table missing – Django migrate will create it.")
        return False
    if "accounts_guardian_old" not in sql:
        print("  emergency_emergencyescalation: FK already correct, skipping.")
        return False

    print("  emergency_emergencyescalation: rebuilding to fix broken guardian FK …")
    con.execute("PRAGMA foreign_keys=OFF")
    con.execute(
        "ALTER TABLE emergency_emergencyescalation "
        "RENAME TO emergency_emergencyescalation_old"
    )
    con.execute(
        """
        CREATE TABLE emergency_emergencyescalation (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            contact_type VARCHAR(20) NOT NULL,
            response_status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
            notified_at DATETIME NOT NULL,
            response_deadline DATETIME,
            responded_at DATETIME,
            created_at DATETIME NOT NULL,
            emergency_id BIGINT NOT NULL
                REFERENCES emergency_emergency(id) DEFERRABLE INITIALLY DEFERRED,
            guardian_id BIGINT
                REFERENCES accounts_guardian(id) DEFERRABLE INITIALLY DEFERRED,
            responder_id BIGINT
                REFERENCES accounts_user(id) DEFERRABLE INITIALLY DEFERRED,
            cancel_comment TEXT,
            cancel_reason VARCHAR(100),
            cancelled_at DATETIME
        )
        """
    )
    con.execute(
        """
        INSERT INTO emergency_emergencyescalation
            (id, contact_type, response_status, notified_at, response_deadline,
             responded_at, created_at, emergency_id, guardian_id, responder_id,
             cancel_comment, cancel_reason, cancelled_at)
        SELECT o.id, o.contact_type, o.response_status, o.notified_at,
               o.response_deadline, o.responded_at, o.created_at,
               o.emergency_id,
               CASE WHEN g.id IS NOT NULL THEN o.guardian_id ELSE NULL END,
               o.responder_id,
               o.cancel_comment, o.cancel_reason, o.cancelled_at
        FROM emergency_emergencyescalation_old o
        LEFT JOIN accounts_guardian g ON g.id = o.guardian_id
        """
    )
    con.execute("DROP TABLE emergency_emergencyescalation_old")
    for col, idx in [
        ("emergency_id",    "emergency_escl_emergency_idx"),
        ("guardian_id",     "emergency_escl_guardian_idx"),
        ("responder_id",    "emergency_escl_responder_idx"),
        ("response_status", "emergency_escl_status_idx"),
    ]:
        con.execute(
            f"CREATE INDEX IF NOT EXISTS {idx} "
            f"ON emergency_emergencyescalation({col})"
        )
    con.execute("PRAGMA foreign_keys=ON")
    print("  emergency_emergencyescalation: rebuild complete.")
    return True


def drop_obsolete_tables(con):
    """Drop obsolete duplicate misspelled escalation table if present."""
    con.execute("DROP TABLE IF EXISTS emergency_emergencyscalation")
    print("  emergency_emergencyscalation: obsolete table dropped if present.")


def main():
    if not DB.exists():
        print(
            "No bundled SQLite database found. "
            "Django migrations will create a fresh one."
        )
        return

    print(f"Repairing demo database: {DB}")
    con = sqlite3.connect(str(DB))
    try:
        drop_obsolete_tables(con)
        rebuild_guardian(con)
        fix_escalation_fk(con)
        con.commit()
        print("Demo DB repair complete [OK]")
    except Exception as exc:
        con.rollback()
        print(f"Repair FAILED: {exc}")
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
