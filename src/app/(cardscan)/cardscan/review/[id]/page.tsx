"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  CardScanCapture,
  ExtractedContactData,
  ConfidenceScores,
  DuplicateMatch,
} from "@/lib/cardscan/types";
import { ConfidenceOverview } from "@/components/cardscan/ConfidenceBadge";
import { DuplicateWarning } from "@/components/cardscan/DuplicateWarning";
import { ContactFieldsCard } from "@/components/cardscan/ContactFieldsCard";
import { AddressCard } from "@/components/cardscan/AddressCard";
import { ContactPersonCard } from "@/components/cardscan/ContactPersonCard";
import { deepEqual } from "@/lib/deep-equal";

export default function CardScanReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [capture, setCapture] = useState<CardScanCapture | null>(null);
  const [formData, setFormData] = useState<ExtractedContactData | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [dupChecking, setDupChecking] = useState(false);
  const [dupAction, setDupAction] = useState<"none" | "override" | "update">("none");
  const [updateTarget, setUpdateTarget] = useState<DuplicateMatch | null>(null);

  // Details ein-/ausklappen
  const [showDetails, setShowDetails] = useState(false);

  // Auto-Save (F5.5) — Debounced PATCH bei jeder Field-Änderung.
  // Verhindert Datenverlust bei Sheet-Dismiss, Tab-Switch oder Back-Navigation.
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedDataRef = useRef<ExtractedContactData | null>(null);

  const loadCapture = useCallback(async () => {
    try {
      const res = await fetch(`/api/cardscan/captures/${id}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Nicht gefunden."); setLoading(false); return { done: true }; }

      const data = json.data as CardScanCapture;
      setCapture(data);
      const contactData = data.final_data || data.extracted_data;

      // OCR noch nicht abgeschlossen → Polling-Loop laufen lassen
      if (data.status === "pending" || data.status === "extracting") {
        return { done: false };
      }

      setFormData(contactData);
      // Initial-Snapshot für Auto-Save-Diff — verhindert ersten unnötigen PATCH
      lastSavedDataRef.current = contactData ? structuredClone(contactData) : null;
      setConfidence(data.confidence_scores);
      // Formular sofort sichtbar – Duplikat-Check läuft im Hintergrund
      setLoading(false);

      // Duplikat-Check unabhängig, blockiert nicht die UI
      if (contactData) {
        setDupChecking(true);
        fetch("/api/cardscan/search-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extracted_data: contactData }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((dj) => { if (dj) setDuplicates(dj.matches || []); })
          .catch(() => {})
          .finally(() => setDupChecking(false));
      }
      return { done: true };
    } catch { setError("Verbindungsfehler."); setLoading(false); return { done: true }; }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function pollLoop() {
      const result = await loadCapture();
      if (cancelled) return;
      if (!result.done) {
        // 1.5s polling-intervall — nicht zu aggressiv, nicht zu langsam
        timer = setTimeout(pollLoop, 1500);
      }
    }
    pollLoop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadCapture]);

  // Auto-Save: 1.5s Debounce nach letzter Änderung
  useEffect(() => {
    if (!formData || saving) return;
    if (lastSavedDataRef.current && deepEqual(lastSavedDataRef.current, formData)) {
      return;
    }
    setAutoSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cardscan/captures/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ final_data: formData }),
        });
        if (res.ok) {
          lastSavedDataRef.current = structuredClone(formData);
          setAutoSaveStatus("saved");
          // Nach 2s Indicator wieder ausblenden
          setTimeout(() => setAutoSaveStatus("idle"), 2000);
        } else {
          setAutoSaveStatus("error");
        }
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [formData, id, saving]);

  function updateField(key: string, value: string) {
    if (!formData) return;
    setFormData({ ...formData, [key]: value || null });
  }
  function updateAddressField(key: string, value: string) {
    if (!formData) return;
    setFormData({ ...formData, address: { ...formData.address, [key]: value || null } as ExtractedContactData["address"] });
  }
  function updateContactPersonField(key: string, value: string) {
    if (!formData) return;
    setFormData({ ...formData, contactPerson: { ...formData.contactPerson, [key]: value || null } as ExtractedContactData["contactPerson"] });
  }

  async function handleConfirm() {
    if (!formData) return;
    if (duplicates.length > 0 && dupAction === "none") {
      setError("Bitte wähle 'Daten ergänzen' oder 'Trotzdem neu anlegen'.");
      return;
    }

    if (dupAction === "update" && updateTarget) {
      setSaving(true); setError(null);
      try {
        const res = await fetch("/api/cardscan/update-customer", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crm: updateTarget.crm, customer_id: updateTarget.customerId, final_data: formData }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Update fehlgeschlagen."); setSaving(false); return; }
        router.push(`/cardscan/success/${id}`);
        return;
      } catch { setError("Verbindungsfehler."); setSaving(false); return; }
    }

    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/cardscan/create-customer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_id: id, final_data: formData, duplicate_override: dupAction === "override" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "CRM-Anlage fehlgeschlagen."); return; }
      router.push(`/cardscan/success/${id}`);
    } catch { setError("Verbindungsfehler."); } finally { setSaving(false); }
  }

  async function handleDiscard() {
    try { await fetch(`/api/cardscan/captures/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "discarded" }) }); } catch {}
    router.push("/cardscan");
  }

  // ─── Loading ────────────────────────────────────────────────────
  if (loading) {
    // F5.3 — OCR-Pipeline-Phasen sichtbar machen statt nur Spinner.
    // Pipeline: pending → extracting → review (formData verfügbar).
    const captureStatus = capture?.status ?? "pending";
    const phase: "pending" | "extracting" | "ready" =
      captureStatus === "pending" ? "pending"
        : captureStatus === "extracting" ? "extracting"
          : "ready";

    return (
      <div className="max-w-lg md:max-w-xl mx-auto">
        {/* Step-Indicator */}
        <div className="card p-5 mb-4" role="status" aria-live="polite">
          <p className="text-[10px] font-semibold text-foreground-subtle tracking-[0.2em] uppercase font-mono-amount">
            KI-Analyse
          </p>
          <p className="font-headline text-base text-foreground mt-1.5 mb-4">
            {phase === "pending" && "Bild wird vorbereitet…"}
            {phase === "extracting" && "Kontaktdaten werden extrahiert…"}
            {phase === "ready" && "Formular wird geladen…"}
          </p>
          <ol className="flex items-center gap-2">
            {([
              { key: "pending", label: "Bild lesen" },
              { key: "extracting", label: "Daten extrahieren" },
              { key: "ready", label: "Bereit zur Prüfung" },
            ] as const).map((step, i) => {
              const isActive = step.key === phase;
              const isDone =
                (phase === "extracting" && step.key === "pending") ||
                (phase === "ready" && step.key !== "ready");
              return (
                <li key={step.key} className="flex items-center gap-2 flex-1">
                  <div
                    className={
                      isDone
                        ? "flex items-center justify-center w-6 h-6 rounded-full bg-cs-success text-white shrink-0"
                        : isActive
                          ? "flex items-center justify-center w-6 h-6 rounded-full bg-cs-extracting text-white shrink-0"
                          : "flex items-center justify-center w-6 h-6 rounded-full bg-input border border-line text-foreground-subtle shrink-0"
                    }
                    aria-hidden="true"
                  >
                    {isDone ? (
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                    ) : isActive ? (
                      <span className="spinner w-3 h-3 border-white/40 border-t-white" />
                    ) : (
                      <span className="text-[10px] font-mono-amount">{i + 1}</span>
                    )}
                  </div>
                  <span className={
                    isActive ? "text-[11px] font-medium text-foreground"
                      : isDone ? "text-[11px] text-cs-success-text"
                        : "text-[11px] text-foreground-subtle"
                  }>
                    {step.label}
                  </span>
                  {i < 2 && <span aria-hidden="true" className="flex-1 h-px bg-line-subtle" />}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[11px] text-foreground-subtle leading-relaxed">
            Die KI-Analyse dauert in der Regel 5–15 Sekunden. Du kannst den Tab geöffnet lassen und in der Zwischenzeit eine andere Visitenkarte scannen.
          </p>
        </div>

        {/* Skeleton-Form als Vorschau */}
        <div className="card p-4 mb-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton-text w-1/5 h-[0.65em]" />
              <div className="skeleton w-full h-10" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <div className="skeleton flex-1 h-12" />
          <div className="skeleton flex-1 h-12" />
        </div>
      </div>
    );
  }

  if (error && !capture) {
    return (
      <div className="max-w-lg md:max-w-xl mx-auto py-20 text-center">
        <p className="text-error text-sm">{error}</p>
        <button onClick={() => router.push("/cardscan")} className="mt-4 text-sm text-foreground-muted underline">Zurück</button>
      </div>
    );
  }

  if (!formData) return null;

  const isCompany = formData.customer_type === "company";
  const canSubmit = duplicates.length === 0 || dupAction !== "none";
  const displayName = isCompany
    ? formData.companyName || [formData.firstName, formData.lastName].filter(Boolean).join(" ")
    : [formData.firstName, formData.lastName].filter(Boolean).join(" ");
  const hasAddress = formData.address && (formData.address.street || formData.address.city);
  // Felder die "sekundär" sind
  const hasSecondaryFields = !!(formData.fax || formData.website || formData.vatId || formData.letterSalutation);

  return (
    <div className="max-w-lg md:max-w-xl mx-auto pb-8 animate-fade-in">
      {/* Auto-Save-Indicator (sticky-top, sehr dezent — fade-in nur bei Aktivität) */}
      {autoSaveStatus !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-2 z-30 flex justify-end mb-2"
        >
          <span
            className={
              autoSaveStatus === "saving"
                ? "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-canvas border border-line text-foreground-subtle shadow-card"
                : autoSaveStatus === "saved"
                  ? "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-success-bg border border-success-border text-success shadow-card"
                  : "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-error-bg border border-error-border text-error shadow-card"
            }
          >
            {autoSaveStatus === "saving" && (
              <>
                <span className="spinner w-2.5 h-2.5" aria-hidden="true" />
                Wird gespeichert…
              </>
            )}
            {autoSaveStatus === "saved" && (
              <>
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                Gespeichert
              </>
            )}
            {autoSaveStatus === "error" && "Speichern fehlgeschlagen"}
          </span>
        </div>
      )}

      {/* ─── Visitenkarten-Preview ─────────────────────────────────── */}
      <div className="card p-5 mb-4 corner-marks">
        <div className="flex items-start gap-4">
          {/* Avatar/Initial */}
          <div className="w-12 h-12 rounded-xl bg-sidebar flex items-center justify-center text-white text-sm font-bold shrink-0">
            {(displayName || "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-headline text-lg text-foreground tracking-tight truncate">
              {displayName || "Unbekannter Kontakt"}
            </h1>
            {isCompany && formData.contactPerson?.firstName && (
              <p className="text-xs text-foreground-muted mt-0.5">
                {formData.contactPerson.firstName} {formData.contactPerson.lastName}
                {formData.contactPerson.role && <span className="text-foreground-subtle"> · {formData.contactPerson.role}</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-foreground-subtle">
              {formData.email && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  {formData.email}
                </span>
              )}
              {formData.phone && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                  {formData.phone}
                </span>
              )}
              {formData.mobile && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                  {formData.mobile}
                </span>
              )}
            </div>
            {hasAddress && (
              <p className="text-xs text-foreground-subtle mt-1.5">
                {[formData.address?.street, formData.address?.houseNumber].filter(Boolean).join(" ")}
                {formData.address?.city && `, ${formData.address.zip || ""} ${formData.address.city}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Confidence */}
      {confidence && <ConfidenceOverview overall={confidence.overall} />}

      {/* Duplikat-Warnung */}
      {dupChecking && (
        <div className="card p-3 mb-4 flex items-center gap-3 text-sm text-foreground-muted">
          <span className="spinner w-4 h-4" aria-hidden="true" />
          Prüfe Duplikate in CRM…
        </div>
      )}
      <DuplicateWarning
        matches={duplicates}
        onOverride={() => setDupAction("override")}
        onUpdate={(match) => { setDupAction("update"); setUpdateTarget(match); }}
        action={dupAction}
      />

      {/* ─── Hauptfelder (immer sichtbar) ─────────────────────────── */}
      <ContactFieldsCard
        data={formData}
        confidence={confidence}
        onChange={updateField}
      />

      {/* ─── Adresse ──────────────────────────────────────────────── */}
      <AddressCard
        address={formData.address}
        confidence={confidence}
        onChange={updateAddressField}
      />

      {/* ─── Ansprechpartner (nur bei Firma) ──────────────────────── */}
      {isCompany && (
        <ContactPersonCard
          contactPerson={formData.contactPerson}
          confidence={confidence}
          onChange={updateContactPersonField}
        />
      )}

      {/* ─── Weitere Details (eingeklappt) ────────────────────────── */}
      {hasSecondaryFields && (
        <div className="mb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between py-2.5 text-xs text-foreground-subtle hover:text-foreground-muted transition-colors"
          >
            <span className="uppercase tracking-wider font-medium">
              Weitere Details
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showDetails && (
            <div className="card p-4 space-y-3">
              {formData.letterSalutation !== undefined && (
                <label className="block">
                  <span className="text-xs text-foreground-muted">Briefanrede</span>
                  <input type="text" value={formData.letterSalutation || ""} onChange={(e) => updateField("letterSalutation", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]" />
                </label>
              )}
              {formData.fax !== undefined && (
                <label className="block">
                  <span className="text-xs text-foreground-muted">Fax</span>
                  <input type="text" value={formData.fax || ""} onChange={(e) => updateField("fax", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]" />
                </label>
              )}
              {formData.website !== undefined && (
                <label className="block">
                  <span className="text-xs text-foreground-muted">Webseite</span>
                  <input type="text" value={formData.website || ""} onChange={(e) => updateField("website", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]" />
                </label>
              )}
              {formData.vatId !== undefined && (
                <label className="block">
                  <span className="text-xs text-foreground-muted">USt-IdNr.</span>
                  <input type="text" value={formData.vatId || ""} onChange={(e) => updateField("vatId", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]" />
                </label>
              )}
              {formData.notes !== undefined && (
                <label className="block">
                  <span className="text-xs text-foreground-muted">Notizen</span>
                  <input type="text" value={formData.notes || ""} onChange={(e) => updateField("notes", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]" />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-md bg-error-bg border border-error-border text-error text-sm mb-4" role="alert">
          {error}
        </div>
      )}

      {/* ─── Aktionen ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={handleDiscard}
          className="flex-1 py-3.5 px-4 rounded-xl border border-line text-foreground-muted text-sm font-medium hover:bg-input transition-colors min-h-[48px] active:scale-[0.98]"
          disabled={saving}
          aria-label="Kontakt verwerfen"
        >
          Verwerfen
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || !canSubmit}
          className="flex-1 py-3.5 px-4 rounded-xl bg-sidebar text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sidebar-hover transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98]"
          aria-label="Kontakt bestätigen und im CRM anlegen"
        >
          {saving ? (
            <>
              <span className="spinner w-4 h-4 border-white/30 border-t-white" aria-hidden="true" />
              Lege an…
            </>
          ) : (
            <>
              <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Anlegen
            </>
          )}
        </button>
      </div>
    </div>
  );
}
