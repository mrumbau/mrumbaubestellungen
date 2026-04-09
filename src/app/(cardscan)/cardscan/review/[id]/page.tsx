"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTransitionRouter } from "next-view-transitions";
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

export default function CardScanReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useTransitionRouter();

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

  const loadCapture = useCallback(async () => {
    try {
      const res = await fetch(`/api/cardscan/captures/${id}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Nicht gefunden."); setLoading(false); return; }

      const data = json.data as CardScanCapture;
      setCapture(data);
      const contactData = data.final_data || data.extracted_data;
      setFormData(contactData);
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
    } catch { setError("Verbindungsfehler."); setLoading(false); }
  }, [id]);

  useEffect(() => { loadCapture(); }, [loadCapture]);

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
    return (
      <div className="max-w-xl mx-auto">
        {/* Visitenkarten-Skeleton */}
        <div className="card p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="skeleton w-12 h-12 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <div className="skeleton-text w-2/3 h-5" />
              <div className="skeleton-text w-1/2 h-3" />
              <div className="skeleton-text w-3/4 h-3" />
            </div>
          </div>
        </div>
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
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={() => router.push("/cardscan")} className="mt-4 text-sm text-[var(--text-secondary)] underline">Zurück</button>
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
    <div className="max-w-xl mx-auto pb-8 animate-fade-in">
      {/* ─── Visitenkarten-Preview ─────────────────────────────────── */}
      <div className="card p-5 mb-4 corner-marks">
        <div className="flex items-start gap-4">
          {/* Avatar/Initial */}
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-sidebar)] flex items-center justify-center text-white text-sm font-bold shrink-0">
            {(displayName || "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-headline text-lg text-[var(--text-primary)] tracking-tight truncate">
              {displayName || "Unbekannter Kontakt"}
            </p>
            {isCompany && formData.contactPerson?.firstName && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {formData.contactPerson.firstName} {formData.contactPerson.lastName}
                {formData.contactPerson.role && <span className="text-[var(--text-tertiary)]"> · {formData.contactPerson.role}</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-tertiary)]">
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
              <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
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
        <div className="card p-3 mb-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
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
            className="w-full flex items-center justify-between py-2.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
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
                  <span className="text-xs text-[var(--text-secondary)]">Briefanrede</span>
                  <input type="text" value={formData.letterSalutation || ""} onChange={(e) => updateField("letterSalutation", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]" />
                </label>
              )}
              {formData.fax !== undefined && (
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Fax</span>
                  <input type="text" value={formData.fax || ""} onChange={(e) => updateField("fax", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]" />
                </label>
              )}
              {formData.website !== undefined && (
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Webseite</span>
                  <input type="text" value={formData.website || ""} onChange={(e) => updateField("website", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]" />
                </label>
              )}
              {formData.vatId !== undefined && (
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">USt-IdNr.</span>
                  <input type="text" value={formData.vatId || ""} onChange={(e) => updateField("vatId", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]" />
                </label>
              )}
              {formData.notes !== undefined && (
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Notizen</span>
                  <input type="text" value={formData.notes || ""} onChange={(e) => updateField("notes", e.target.value)} className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]" />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm mb-4" role="alert">
          {error}
        </div>
      )}

      {/* ─── Aktionen ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={handleDiscard}
          className="flex-1 py-3.5 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors min-h-[44px]"
          disabled={saving}
          aria-label="Kontakt verwerfen"
        >
          Verwerfen
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || !canSubmit}
          className="flex-1 py-3.5 px-4 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-sidebar-hover)] transition-colors flex items-center justify-center gap-2 min-h-[44px]"
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
