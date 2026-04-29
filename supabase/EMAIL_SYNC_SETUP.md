# E-Mail-Sync Setup-Anleitung (pg_cron Fan-out-Architektur)

Schritt-für-Schritt-Doku um die in-app E-Mail-Pipeline zum Laufen zu bringen.
Nach diesem Setup ist Make.com komplett ablösbar.

## Architektur-Übersicht

```
┌──────────────────┐    ┌──────────────────────────────────────────┐
│ pg_cron          │    │ Vercel-Hobby (kein Pro-Upgrade nötig)    │
│ (Supabase)       │    │                                          │
│                  │    │                                          │
│ alle 2 Min ─────►│ POST /api/cron/discover-emails               │
│ (discover)       │    │   → liest Microsoft Graph Delta         │
│                  │    │   → schreibt 'pending' in DB            │
│                  │    │   → 5–10s Lambda-Run                    │
│                  │    │                                          │
│ jede Min ───────►│ SELECT fan_out_pending_mails()              │
│ (process)        │    │   → pro pending-Mail PARALLEL          │
│                  │    │     POST /api/cron/process-one          │
│                  │    │     [Lambda A] [Lambda B] [Lambda C]    │
│                  │    │     ↑ je 60s Budget pro Mail            │
│                  │    │                                          │
│ stündlich ──────►│ POST /api/cron/retry-failed-emails           │
│ (retry)          │    │   → reprocess failed Mails              │
│                  │    │                                          │
│ alle 5 Min ────► │ UPDATE: stale pending → failed                │
│ (cleanup)        │    │   (pure SQL, kein Lambda)                │
└──────────────────┘    └──────────────────────────────────────────┘
```

## Voraussetzungen

- Supabase Free-Konto (Pro nicht nötig)
- Vercel Hobby (Pro nicht nötig)
- Azure AD App registriert (siehe `memory/reference_azure_ad_email_sync.md`)
- Alle Code-Migrationen sind schon gelaufen (Tabellen + Functions)

## Setup-Schritte

### 1. Code deployen

```bash
# Code committen + pushen
git push origin main

# Vercel deployt automatisch (vercel.json hat keine Crons mehr → kein Hobby-Limit-Konflikt)
# Warte bis cloud.mrumbau.de das neue Deployment hat (~2 min)
```

### 2. Vercel-ENV verifizieren

Im Vercel-Dashboard → Settings → Environment Variables muss vorhanden sein:

| Name | Wert | Notiz |
|---|---|---|
| `MS_TENANT_ID` | `562b6709-e710-488f-9985-f690906f7e6f` | schon gesetzt |
| `MS_CLIENT_ID` | `2b735043-d551-4269-bb8e-b1669a543e26` | schon gesetzt |
| `MS_CLIENT_SECRET` | (geheim) | schon gesetzt |
| `MS_MAILBOX` | `info@mrumbau.de` | schon gesetzt |
| `CRON_SECRET` | (geheim, 64-Hex) | schon gesetzt — **diesen Wert brauchst du gleich!** |

### 3. CRON_SECRET aus Vercel kopieren

Klick auf den Wert von `CRON_SECRET` und kopiere ihn in die Zwischenablage. Den brauchst du im nächsten Schritt für Supabase.

### 4. Supabase pg_cron-Setup ausführen

1. Supabase-Dashboard → dein Projekt → **SQL Editor** → **New query**
2. Öffne lokal die Datei `supabase/email-sync-pgcron-setup.sql`
3. Kopiere den kompletten Inhalt in den SQL Editor
4. **WICHTIG**: Ersetze den Platzhalter `<DEIN_CRON_SECRET>` (Zeile in Schritt 1) durch deinen kopierten CRON_SECRET-Wert
5. Klick **Run**

### 5. Verifikation in Supabase

```sql
-- Sollte 4 aktive Jobs zeigen:
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Erwartete Ausgabe:
-- jobname                | schedule      | active
-- cleanup-stale-pending  | */5 * * * *   | true
-- discover-emails        | */2 * * * *   | true
-- process-pending-emails | * * * * *     | true
-- retry-failed-emails    | 0 * * * *     | true
```

### 6. Erste Cron-Runs beobachten

```sql
-- Zeigt die letzten Cron-Runs mit Status:
SELECT
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status,
  jrd.return_message
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
ORDER BY jrd.start_time DESC
LIMIT 20;
```

Beim ersten `discover-emails`-Run werden alle aktiven Folder im **Bootstrap-Modus** verarbeitet — Mails werden als `irrelevant` mit `error_msg='bootstrap_skip'` markiert ohne KI-Verarbeitung. Ab dem zweiten Run werden nur neue Mails durch die Pipeline gejagt.

### 7. HTTP-Calls verifizieren

```sql
-- Zeigt die letzten POST-Calls von pg_net an Vercel:
SELECT created, status_code, content_type, content
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

**Erwartung**: status_code 200, content enthält `{"total_folders": ...}` oder ähnlich.

**Fehlermöglichkeiten**:
- 401: CRON_SECRET in Vault stimmt nicht mit Vercel-ENV überein → Setup neu mit korrektem Wert
- 404: URL falsch (vergessen die `app_base_url` zu setzen oder falsch gesetzt)
- 500: Vercel-Lambda hat einen Fehler — check Vercel-Logs

### 8. App-UI verifizieren

`https://cloud.mrumbau.de/einstellungen/system/email-sync` öffnen.

Tab "Folder" zeigt jetzt:
- Health-Card mit aktuellem Sync-Status
- Pending-Counter (0 wenn process-one schnell abarbeitet)
- "Stale Pending" Warnung wenn cleanup nicht läuft

## Wartung & Debugging

### Cron-Job temporär pausieren

```sql
-- Pausieren:
UPDATE cron.job SET active = false WHERE jobname = 'discover-emails';

-- Wieder aktivieren:
UPDATE cron.job SET active = true WHERE jobname = 'discover-emails';
```

### Cron-Job löschen

```sql
SELECT cron.unschedule('discover-emails');
```

### CRON_SECRET ändern (nach Rotation)

1. Neuen Wert in Vercel-ENV setzen
2. In Supabase neuen Vault-Eintrag erstellen:
   ```sql
   -- Alten Vault-Secret löschen
   DELETE FROM vault.secrets WHERE name = 'cron_secret';
   -- Neuen anlegen mit dem rotierten Wert
   SELECT vault.create_secret('NEUER_WERT', 'cron_secret', '...');
   ```

### App-Base-URL ändern (z.B. für Test-Umgebung)

```sql
DELETE FROM vault.secrets WHERE name = 'app_base_url';
SELECT vault.create_secret('https://staging.cloud.mrumbau.de', 'app_base_url', '...');
```

### Manueller Trigger zum Testen

```sql
-- Discover sofort triggern (wartet nicht auf nächste 2-Min-Mark):
SELECT trigger_discover_emails();

-- Pending-Mails sofort fan-outen:
SELECT fan_out_pending_mails();

-- Stale-Pending manuell aufräumen:
SELECT cleanup_stale_pending_mails();
```

## Häufige Probleme

### Problem: 0 aktive Cron-Jobs

`SELECT * FROM cron.job` ist leer → Setup-Script wurde nicht ausgeführt oder Schema-Migrations laufen noch.

**Fix**: Setup-Script (`supabase/email-sync-pgcron-setup.sql`) erneut im SQL Editor ausführen.

### Problem: pending-Mails werden nicht abgearbeitet

`SELECT COUNT(*) FROM email_processing_log WHERE status = 'pending'` wächst → process-one wird nicht aufgerufen.

**Diagnose**:
```sql
-- Lief der Cron in den letzten Minuten?
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-pending-emails')
ORDER BY start_time DESC LIMIT 5;

-- Ist fan_out_pending_mails() Function da?
SELECT * FROM net._http_response WHERE url LIKE '%process-one%' ORDER BY created DESC LIMIT 5;
```

Wenn HTTP-Status 401: Vault-Secret stimmt nicht. Wenn 500: Vercel-Logs checken.

### Problem: discover-emails läuft, aber 0 neue Mails

- Folder noch im Bootstrap-Modus → Mails werden auf `irrelevant`/`bootstrap_skip` gesetzt, das ist normal
- Outlook-Folder leer / keine neuen Mails seit letztem Sync
- Microsoft Graph Connection-Fehler: check Vercel-Lambda-Logs

### Problem: Auto-Retry tut nichts

Failed-Mails werden frühestens beim nächsten stündlichen Retry verarbeitet. Wenn du sofort retryen willst:
```sql
SELECT trigger_retry_failed_emails();
```

## Architektur-Vorteile gegenüber Vercel-Cron

| | Vercel-Cron-Pro ($20/m) | pg_cron (free) |
|---|---|---|
| Min-Intervall | 1 min | 1 min |
| Trigger-Latenz | ~200 ms | ~100 ms |
| Vendor | Vercel | Supabase (schon da) |
| Versionskontrolle | vercel.json | SQL-Migration im Repo |
| Cost | $240/Jahr | $0 |
| Function-Time-Limit | 300 s | 60 s (Hobby), aber: **per-Mail-Lambda umgeht das Limit dank Fan-out** |

## Kontaktpunkte beim Debugging

- **Cron-Job-Listing**: `SELECT * FROM cron.job;`
- **Cron-Run-Historie**: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`
- **HTTP-POST-Antworten**: `SELECT * FROM net._http_response ORDER BY created DESC;`
- **Pending-Queue**: `SELECT COUNT(*) FROM email_processing_log WHERE status = 'pending';`
- **Vercel-Logs**: Vercel Dashboard → Project → Logs (filter by `/api/cron/`)
- **App-Health**: `https://cloud.mrumbau.de/api/health` → JSON mit email_sync-Subsystem
- **Admin-UI**: `/einstellungen/system/email-sync` → Health-Card + Live-Monitor
