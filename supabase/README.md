# Supabase

## Source-of-Truth für das Schema

**Die Migrations-History in Supabase ist die Source-of-Truth, nicht `schema.sql`.**

Der Stand der DB wird durch alle ausgeführten Migrationen definiert. Liste der Migrationen:

```bash
# Via Supabase CLI:
supabase migration list

# Oder direkt in der Supabase-Dashboard-UI:
# Project → Database → Migrations
```

## Aktuelle Schema-Snapshots erzeugen

Wenn ein Klartext-Schema-Snapshot benötigt wird (z.B. für Code-Review oder Onboarding):

```bash
supabase db dump --schema public > supabase/snapshot.sql
```

Dieser Befehl erfordert eine eingeloggte Supabase-CLI und ist Linux-/macOS-kompatibel.

## Setup-Dateien in diesem Verzeichnis

- **`schema.sql`** — Initialer Schema-Snapshot vom 2026-03-17. **Nicht aktuell**, nur als historische Referenz. Im Header-Kommentar steht eine Liste was fehlt.
- **`email-sync-pgcron-setup.sql`** — pg_cron-Setup-Script für die Email-Pipeline (Vault-Secrets + 4 Cron-Jobs). Wird einmalig im SQL Editor ausgeführt.
- **`EMAIL_SYNC_SETUP.md`** — Anleitung für das Email-Sync-Setup.

## Migration-Workflow

Neue Schema-Änderungen werden via `mcp__supabase__apply_migration` (mit dem Supabase-MCP) oder direkt im SQL-Editor angewendet. Migrations sollten:

1. Klaren Namen haben (`<area>_<verb>_<object>`, z.B. `bestellungen_add_archiviert_columns`)
2. Idempotent sein wo möglich (`IF NOT EXISTS`, `DROP POLICY IF EXISTS ...`)
3. RLS-Policies bei jeder neuen Tabelle aktivieren (sonst CRITICAL via Advisor)

## Audit-Hinweis

Letzter Backend-Audit (2026-04-29) hat Schema-Drift als Finding F1.3 dokumentiert — siehe `memory/audit_phase_1_database.md`.
