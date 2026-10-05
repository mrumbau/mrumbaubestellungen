# Bestellwesen — Architektur in einer Seite

Stand 05.10.2026. Dieses Dokument beantwortet eine Frage: **Wo muss ich hin, wenn ich X ändern will?**
Alles andere steht in `CLAUDE.md` (Projektkontext), `PRODUCT.md` (Fachlichkeit) und `DESIGN.md` (Oberfläche).

## Der Weg einer Mail

```
Outlook-Ordner ──discover (pg_cron)──▶ email_processing_log (pending)
                                            │
                     replay.ts ─────────────┘  holt Mail + Anhänge über Microsoft Graph
                        │
                        ▼
              email-pipeline/run.ts  (Orchestrator, nummerierte Schritte 1–24)
                        │
   ┌────────────────────┼─────────────────────────────────────────────────┐
   │ Vorprüfung         │ classify-logic.ts   relevant? (Blacklist, System-Domains, Freemail, KI) │
   │ Händler            │ haendler-erkennen.ts  Absender → haendler / subunternehmer / abo  │
   │ Anhänge            │ anhang-handling.ts → xrechnung.ts (ZUGFeRD) → anhang-analyse.ts (KI) │
   │ Besteller          │ besteller-zuordnung.ts  Stufen −1, 3, 4, 4.5, 5 (siehe unten)      │
   │ Bestellung finden  │ bestellung-finden.ts → bestellung-match.ts  Stufen 1–5            │
   │ Speichern          │ dokument-persist.ts, bestellung-propagate.ts                      │
   │ Nachlauf           │ post-processing.ts  Status, Abgleich, Preisanomalie, Events       │
   └──────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
              markProcessed() in email-sync/idempotency.ts  schreibt Ergebnis ins Protokoll
```

Zweiter Pass: `second-review-runner.ts` schaut sich still verworfene Mails noch einmal an;
`second-review-leerlauf.ts` bremst Absender, bei denen das nie etwas brachte.

## Wer bekommt die Bestellung? (`besteller-zuordnung.ts`)

| Stufe | Quelle | Greift wenn |
| --- | --- | --- |
| −1 | `besteller_rules` (Admin-Regeln, RPC `match_besteller_rules`) | eine Regel passt und das Ziel noch Bestellungen annimmt |
| 3 | Händler-Affinität (letzte 50 Bestellungen des Händlers) | ≥ 3 Belege und > 60 % derselbe Besteller |
| 4 | Name im Dokument / im Mailtext | voller Name eines aktiven Bestellers taucht auf |
| 4.5 | KI-Historie (`erkenneBestellerIntelligent`) | Konfidenz ≥ 0,6 |
| 5 | Einziger aktiver Besteller | genau eine Person mit `nimmt_neue_bestellungen` |
| — | `UNBEKANNT` → Pool | sonst |

Wer Bestellungen bekommen darf, entscheidet `darfBestellungenErhalten()` in `lib/rollen.ts`:
Besteller und Geschäftsführung ja, Admin und Buchhaltung nein.

## Rollen (`lib/rollen.ts`)

| Rolle | Verwaltet | Bekommt Bestellungen | Testdaten / DSGVO |
| --- | --- | --- | --- |
| admin | ja | nein | ja |
| geschaeftsfuehrer | ja | ja | nein |
| besteller | nein | ja | nein |
| buchhaltung | nein | nein | nein |

Jede Rechteprüfung geht über `istVerwaltung()` / `istNurAdmin()` / `requireRoles()`.
Ein direkter Vergleich auf `"admin"` ist per ESLint verboten — er sperrt die Geschäftsführung still aus.
In der Datenbank bildet `get_user_rolle()` die Geschäftsführung auf `admin` ab (alle 56 RLS-Regeln meinen „darf verwalten").

## Was in welcher Liste steht (`lib/bestellungen-lane-loader.ts`)

| Liste | Bedingung |
| --- | --- |
| Pool | `besteller_kuerzel = 'UNBEKANNT'` und Material |
| In Arbeit | Status nicht freigegeben/verworfen/storniert **und** `erledigt_am IS NULL` |
| Archiv | Status freigegeben/verworfen/storniert **oder** `erledigt_am` gesetzt |
| Eingang | Sicht `v_rechnungseingang`: jede Mail des Rechnungsordners mit Zustand; `offen` = keine Bestellung, nicht gesichtet, kein DATEV-Rückläufer |

`erledigt_am` setzt ausschließlich der Trigger `trg_bestellungen_erledigt`: Gutschrift oder vorausbezahlt **und** Status `vollstaendig`.

## Datenbank — die Objekte, die man kennen muss

| Objekt | Zweck |
| --- | --- |
| `bestellungen`, `dokumente` | Vorgänge und Belege |
| `email_processing_log` | eine Zeile je Mail; `gesichtet_am` = ein Mensch hat sie gesehen |
| `benutzer_rollen` | Rolle, Kürzel, `nimmt_neue_bestellungen` |
| `haendler` | Stammdaten inkl. `immer_vorausbezahlt`, `zahlungsziel_tage` |
| `besteller_rules` + `match_besteller_rules()` | Regel-Engine, Stufe −1 |
| `v_rechnungseingang` | Grundlage der Eingangs-Seite |
| `get_user_rolle()` | Rolle für RLS (Geschäftsführung = admin) |
| pg_cron Jobs | Mailabruf, KPI-Refresh, Cron-Log-Retention |

Migrationen liegen unter `supabase/migrations/`, Dateiname = Datum + Thema, Kommentar = Warum.
**Reihenfolge bei Änderungen: erst Code live, dann Daten.** Rollen- und Kennzeichen-Änderungen nie vor dem Deployment.

Betriebsnotiz: Das Supabase-MCP-Werkzeug hängt bei Funktionskörpern mit nacktem `$$` — Tag verwenden (`$name$`).

## Oberfläche — wo liegt was

| Seite | Datei | Zweck |
| --- | --- | --- |
| Bestellungen (Pool / In Arbeit / Archiv) | `app/(dashboard)/bestellungen/(workspace)/*` → `components/bestellungen-tabelle.tsx`, `pool-inbox.tsx` | tägliche Arbeit |
| Bestelldetail | `app/(dashboard)/bestellungen/[id]/_components/*` | Belege, Freigabe (`approval-panel.tsx`) |
| Eingang | `app/(dashboard)/eingang/*` | Kontrolle des Rechnungsordners, Sichtung |
| Buchhaltung | `components/buchhaltung-client.tsx` | Bezahlt markieren, DATEV |
| Einstellungen → Händler | `einstellungen/haendler/*` | vorausbezahlt, Zahlungsziel |
| Einstellungen → System | `einstellungen/system/*` | E-Mail-Sync, Benutzer, Regeln, Pipeline-Qualität, Testdaten (nur Admin) |

Navigation: `components/sidebar.tsx` — zwei Fassungen (voll / Buchhaltung), nie nach Rollen-Namen verzweigen.
Die Liste lädt nach einer eigenen Aktion ausdrücklich nach (`use-bestellungen-actions.ts`); Realtime ist nur für die Änderungen anderer.

## Prüfen vor jedem Push

```
npx tsc --noEmit && npx vitest run && npx eslint src/ && OPENAI_API_KEY=sk-dummy npx next build
```

Jede Verhaltensänderung bekommt einen Test, und der Test wird einmal gegen eine kaputte Fassung laufen gelassen
(„fällt er um?"). Was nicht umfällt, prüft nichts.
