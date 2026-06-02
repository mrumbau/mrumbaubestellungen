# Product

## Register

product

## Users

**Vier Personen einer mittelständischen Bauunternehmung (MR Umbau GmbH):**

- **MT (Marlon Tschon, Firmeninhaber, Besteller)** und **CR (Carsten Reuter, Besteller)**: bestellen täglich bei 16+ Händlern (Bauhaus, OBI, Raab Karcher, Plancraft, Brillux, etc.) über Webshops. Wechseln zwischen Baustelle und Büro, nutzen Desktop + Handy.
- **MH (Mohammed Hawrami, Admin / IT)**: betreut System, sieht alle Bestellungen, verwaltet Händler/Projekte/Benutzer. Sitzt im Büro, Desktop.
- **NJ (Nada Jerinic, Buchhaltung)**: arbeitet ausschließlich mit freigegebenen Rechnungen. Klassische Desktop-Buchhaltungssoftware-Mentalität — erwartet DATEV-Export, Bezahlt-Toggle, klare Listen.

Alle drei Bestell-Personen teilen sich `info@mrumbau.de` — alle eingehenden Mails von Händlern (Bestätigung, Lieferschein, Rechnung) landen in einer Inbox. Die Pipeline klassifiziert + sortiert automatisch.

## Product Purpose

**Was es tut:** Vollautomatisches Order-Management für eine Inbox. KI-getriebene Pipeline (Microsoft Graph + GPT-4o + 16 Vendor-Parser) klassifiziert eingehende Mails, verknüpft die 3 Dokumente einer Bestellung (Bestätigung, Lieferschein, Rechnung), gleicht inhaltlich ab und ermöglicht 1-Klick-Freigabe an die Buchhaltung.

**Wirtschaftlicher Hebel:** Spart 4-6 Stunden Sortier-Arbeit pro Woche pro Besteller. KI-Kosten ~0.30€/Tag bei ~50 Mails. Make.com komplett ersetzt.

**Erfolgs-Kriterien:**
- Bestellung mit 3 Dokumenten erscheint automatisch korrekt zugeordnet
- Besteller sieht „Freigeben"-Button, klickt, Nada sieht die Rechnung sofort
- DATEV-CSV-Export einer Monats-Charge liegt fertig vor

## Brand Personality

**Drei Worte:** *Linear-präzise, Handwerk-robust, ruhig.*

**Tonalität:**
- Bau-Branche: keine „Friction-less"-SaaS-Floskeln, kein „Let's get started"
- Pragmatisch deutsch, vornehm: „Rechnung freigeben" statt „Approve invoice"
- Technisch ehrlich: zeigt Cost-Tracking, OpenAI-Tokens, Pipeline-Telemetrie wenn der User es will

**Visuelle Emotion:** sollte sich anfühlen wie ein gut gewartetes Werkzeug. Nicht „Lifestyle-App", nicht „Spielzeug". MR-Red als kraftvoller Brand-Anker, industrielle SVG-Texturen (grid, iso-grid, corner-marks, industrial-line) als bewusste Anti-Cliché-Geste.

## Anti-references

**Nicht:**
- Bunte SaaS-Onboarding mit Gradient-Hero und „Welcome aboard 🎉" (Tonalität verfehlt)
- Generisches Material-Design-Blau (Bau-Branche duldet kein „Mama-Blau")
- Notion-Style „Everything is a card" — wir haben Tabellen weil Tabellen für 50+ Bestellungen das richtige Werkzeug sind
- Linear-Klon — Linear ist Tickets, wir sind Bestellungen mit anderen Constraints (Beträge, PDFs, Workflow)
- Salesforce-Style Dichte ohne Whitespace
- Dunkles Theme als Default — bauliches Büro hat Tageslicht

## Design Principles

1. **Hot-Path zuerst.** Drei Besteller arbeiten täglich in der Bestellungen-Liste und Detail-Page. Jede Pixel-Entscheidung dort zählt. Settings-Pages dürfen langweilig sein.
2. **Zeige was die KI tut, verstecke nicht.** Pipeline-Telemetrie, KI-Kosten, Vendor-Parser-Quote sichtbar im Admin-Bereich. Wenn die KI etwas vorschlägt, zeige Konfidenz + Begründung.
3. **Status > Zustand.** Eine Bestellung hat 6 mögliche Status. Jeder ist eine Farbe + Icon + Label (color-not-only). User soll auf Distanz erkennen wo eine Bestellung steht.
4. **Tabelle ist OK, wenn die Daten tabellenförmig sind.** 50+ Bestellungen sind eine Tabelle. Aktive Projekte sind Cards. Wähle das richtige Werkzeug, nicht das modische.
5. **Industrielle Identität, nicht industrielle Brutalität.** Corner-marks, dezente Grid-Texturen, Barlow-Condensed-Headlines deuten Werkzeug-Schwere an. Aber keine pure Brutalismus-Härte — Whitespace und runde Ecken bleiben.

## Accessibility & Inclusion

- **WCAG AA Ziel** (4.5:1 Body, 3:1 Large)
- Color-not-only: Status durch Icon+Farbe+Label (UI-Audit F3.4 ✓)
- Touch-Targets ≥44px auf Mobile, kompakter auf Desktop (UI-Audit F1.12 ✓ via responsive `md:`-Modifier)
- `prefers-reduced-motion` honoriert (globals.css L488-499)
- Skip-Link, sichtbarer Focus-Ring (`--shadow-focus-ring` mit brand-tint), aria-labels für icon-only Buttons
- Deutsche Sprache durchgängig — keine englischen Mix-Strings im UI
- 1 von 4 Usern (NJ) ist klassisch nicht digital-affine — UI muss ohne Tutorial verständlich sein

## Stand der Implementation (12.05.2026)

- UI-Audit: ~78/90 echte Findings adressiert (~87%), CardScan separater Audit
- Decomposition heute: 4618 → 1946 LOC in 4 Monolith-Files (-58%)
- 394 Tests grün, Production-Build clean
- Foundation-System: 6 Status-Tokens × 3-Part-Triplet, Industrial-SVG-Texturen, OKLCH-Tinted-Neutrals, DM Sans + Barlow Condensed + JetBrains Mono

## Pool-Modell (02.06.2026)

**Was sich geändert hat:** UNBEKANNT-Material-Bestellungen — Pipeline kann den Besteller nicht eindeutig zuordnen — lagen historisch im Limbo und wurden nur via separater `/todo`-Page sichtbar. Real-World-Effekt: 27% Recall-Lücke (19,3% der Bestellungen) und 138h Median-Latenz bis Pick. Die Pool-Reform macht UNBEKANNT-Items für **alle Besteller in der Hauptliste sichtbar** und gibt klare Aktionen ohne Limbo.

**Mental Model (in einem Satz für MT/CR/MH):**
> Pool = was niemand erledigt hat. Meine erledigten = was ich freigegeben habe. Alles dazwischen ist Filter, und der Pipeline-Vorschlag ist eine Maschinen-Meinung, kein Urteil.

**Was bleibt unverändert:**
- Status-Machine (6 Workflow-States) bleibt intakt — Pool ist KEIN 7. Status, sondern ein **Filter-Scope** über die Owner-Zuweisung
- Buchhaltungs-Sicht — NJ sieht weiterhin NUR freigegebene/Gutschrift-Items, RLS-verifiziert pro Rolle
- Pipeline-Stufen (Rules-Engine → haendler_affinitaet → name_im_text → ki_historisch) bleiben aktiv und liefern **unverbindliche Vorschläge** in `vorschlag_kuerzel` + `vorschlag_konfidenz`

**Was neu ist (Phasen 1–6):**
- 4 ScopeTabs in `/bestellungen`: Pool / Meine offen / Meine erledigt / Alle (URL-State, Counter-Pills)
- BestellerCell mit 4 States als Single Render-Pfad (Owner / Vorschlag / Geteilt / Unzugeordnet) — Inline-Klone verboten
- OwnerLane im Detail-Header: Magnetic-CTA „Übernehmen", Reassign-Modal, Return-ConfirmDialog, Optimistic-UI mit race-safe RPC-Layer
- PresenceBanner: „CR schaut seit 2 Min." als Awareness ohne Hard-Lock — neutral muted, statischer Live-Dot
- Sidebar Pool-Counter Badge am Bestellungen-NavItem
- Daily-Mahn-Mail: Pool-Digest (07:45) + Owner-Mahnung (08:00), beide mit Reply-Token-Action `UEBERNEHMEN [REF:…]` für Mail-Reply-Claim. Token-Invalidierung nach erster Action (Hijacking-Schutz).
- PoolHeroCard im Dashboard: Anzahl + Ältester-Eintrag + Top-3-Vendor-Histogramm

**Conflict-Resolution-Prinzip:** Race-Conditions werden silent + kontextualisiert behandelt. Bei Doppel-Claim sieht der zweite Klick einen Toast „Wurde gerade von MT übernommen — 14:32" + auto-Refresh; kein 409, kein Modal. GoBD-Audit-Trail über `events.pool_claim` / `pool_reassign` / `pool_return`.
