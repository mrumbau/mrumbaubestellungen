"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  CardScanCapture,
  ExtractedContactData,
  ConfidenceScores,
  DuplicateMatch,
} from "@/lib/cardscan/types";

// ─── Field Configs ──────────────────────────────────────────────────

const FIELD_CONFIG: {
  key: keyof ExtractedContactData;
  label: string;
  type?: "select";
  options?: { value: string; label: string }[];
}[] = [
  {
    key: "customer_type",
    label: "Typ",
    type: "select",
    options: [
      { value: "company", label: "Firma" },
      { value: "private", label: "Privatperson" },
      { value: "publicSector", label: "Öffentliche Hand" },
    ],
  },
  {
    key: "gender",
    label: "Geschlecht",
    type: "select",
    options: [
      { value: "", label: "– unbekannt –" },
      { value: "m", label: "Männlich" },
      { value: "f", label: "Weiblich" },
      { value: "family", label: "Familie" },
    ],
  },
  { key: "title", label: "Titel" },
  { key: "firstName", label: "Vorname" },
  { key: "lastName", label: "Nachname" },
  { key: "companyName", label: "Firma" },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon (Festnetz)" },
  { key: "mobile", label: "Mobilnummer" },
  { key: "fax", label: "Fax" },
  { key: "website", label: "Webseite" },
  { key: "vatId", label: "USt-IdNr." },
  { key: "notes", label: "Notizen" },
];

const ADDRESS_FIELDS = [
  { key: "street", label: "Straße" },
  { key: "houseNumber", label: "Hausnummer" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Stadt" },
  { key: "countryCode", label: "Land (ISO)" },
];

const CONTACT_PERSON_FIELDS: {
  key: string;
  label: string;
  type?: "select";
  options?: { value: string; label: string }[];
}[] = [
  {
    key: "salutation",
    label: "Anrede",
    type: "select",
    options: [
      { value: "", label: "– unbekannt –" },
      { value: "m", label: "Herr" },
      { value: "f", label: "Frau" },
    ],
  },
  { key: "firstName", label: "Vorname" },
  { key: "lastName", label: "Nachname" },
  { key: "title", label: "Titel" },
  { key: "role", label: "Position/Funktion" },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon" },
  { key: "mobile", label: "Mobil" },
];

// ─── Components ─────────────────────────────────────────────────────

function ConfidenceDot({ score }: { score: number | undefined }) {
  if (score === undefined || score >= 0.8) return null;
  const color = score >= 0.5 ? "bg-amber-400" : "bg-red-500";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ml-1.5`}
      title={`Confidence: ${Math.round((score ?? 0) * 100)}%`}
    />
  );
}

function DuplicateWarning({
  matches,
  onOverride,
  overridden,
}: {
  matches: DuplicateMatch[];
  onOverride: () => void;
  overridden: boolean;
}) {
  if (matches.length === 0) return null;

  const bestMatch = matches[0];
  const scorePercent = Math.round(bestMatch.score * 100);

  return (
    <div className="card p-4 mb-4 border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            Möglicherweise bereits vorhanden ({scorePercent}% Übereinstimmung)
          </p>
          <div className="mt-2 space-y-1.5">
            {matches.slice(0, 3).map((m, i) => (
              <div key={i} className="text-xs text-amber-700 bg-amber-100/50 rounded px-2 py-1">
                <span className="font-medium uppercase text-[10px] mr-1.5">
                  {m.crm === "crm1" ? "CRM 1" : "CRM 2"}
                </span>
                {m.companyName && <span>{m.companyName} – </span>}
                {m.firstName} {m.lastName}
                {m.email && <span className="text-amber-600"> ({m.email})</span>}
                <span className="block text-amber-500 mt-0.5">{m.reason}</span>
              </div>
            ))}
          </div>
          {!overridden && (
            <button
              onClick={onOverride}
              className="mt-3 text-xs font-medium text-amber-700 hover:text-amber-900 underline transition-colors"
            >
              Trotzdem anlegen →
            </button>
          )}
          {overridden && (
            <p className="mt-2 text-xs text-amber-600 font-medium">
              ✓ Override bestätigt – wird trotz Duplikat angelegt
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function CardScanReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [capture, setCapture] = useState<CardScanCapture | null>(null);
  const [formData, setFormData] = useState<ExtractedContactData | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplikat-State
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [dupChecking, setDupChecking] = useState(false);
  const [dupOverride, setDupOverride] = useState(false);

  const loadCapture = useCallback(async () => {
    try {
      const res = await fetch(`/api/cardscan/captures/${id}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Capture nicht gefunden.");
        setLoading(false);
        return;
      }

      const data = json.data as CardScanCapture;
      setCapture(data);
      const contactData = data.final_data || data.extracted_data;
      setFormData(contactData);
      setConfidence(data.confidence_scores);

      // Duplikat-Check automatisch beim Laden
      if (contactData) {
        setDupChecking(true);
        try {
          const dupRes = await fetch("/api/cardscan/search-duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extracted_data: contactData }),
          });
          if (dupRes.ok) {
            const dupJson = await dupRes.json();
            setDuplicates(dupJson.matches || []);
          }
        } catch {
          // Duplikat-Check-Fehler ist nicht kritisch
        } finally {
          setDupChecking(false);
        }
      }
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCapture();
  }, [loadCapture]);

  function updateField(key: string, value: string) {
    if (!formData) return;
    setFormData({ ...formData, [key]: value || null });
  }

  function updateNestedField(
    parent: "address" | "contactPerson",
    key: string,
    value: string
  ) {
    if (!formData) return;
    const current = formData[parent] || {};
    setFormData({
      ...formData,
      [parent]: { ...current, [key]: value || null },
    });
  }

  async function handleConfirm() {
    if (!formData) return;

    // Duplikat-Warnung: Wenn Duplikate gefunden und kein Override → blockieren
    if (duplicates.length > 0 && !dupOverride) {
      setError("Bitte bestätige den Duplikat-Override bevor du fortfährst.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/cardscan/create-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capture_id: id,
          final_data: formData,
          duplicate_override: dupOverride,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "CRM-Anlage fehlgeschlagen.");
        return;
      }

      router.push(`/cardscan/success/${id}`);
    } catch {
      setError("Verbindungsfehler beim CRM-Write.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    try {
      await fetch(`/api/cardscan/captures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "discarded" }),
      });
    } catch {
      // ignorieren
    }
    router.push("/cardscan");
  }

  // ─── Loading / Error States ───────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="spinner w-8 h-8 mx-auto" />
        <p className="text-sm text-[var(--text-tertiary)] mt-4">Lade Daten…</p>
      </div>
    );
  }

  if (error && !capture) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={() => router.push("/cardscan")}
          className="mt-4 text-sm text-[var(--text-secondary)] underline"
        >
          Zurück
        </button>
      </div>
    );
  }

  if (!formData) return null;

  const isCompany = formData.customer_type === "company";
  const hasDuplicates = duplicates.length > 0;
  const canSubmit = !hasDuplicates || dupOverride;

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto pb-8">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-1">
        Daten prüfen
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Prüfe die erkannten Daten und korrigiere bei Bedarf.
        <span className="inline-flex items-center ml-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
          <span className="text-xs">unsicher</span>
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-2 mr-1" />
          <span className="text-xs">sehr unsicher</span>
        </span>
      </p>

      {/* Duplikat-Warnung */}
      {dupChecking && (
        <div className="card p-3 mb-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="spinner w-4 h-4" />
          Prüfe Duplikate in CRM…
        </div>
      )}
      <DuplicateWarning
        matches={duplicates}
        onOverride={() => setDupOverride(true)}
        overridden={dupOverride}
      />

      {/* Confidence-Übersicht */}
      {confidence && (
        <div className="card p-3 mb-6 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold ${
              confidence.overall >= 0.8
                ? "bg-emerald-600"
                : confidence.overall >= 0.5
                  ? "bg-amber-500"
                  : "bg-red-600"
            }`}
          >
            {Math.round(confidence.overall * 100)}%
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Gesamt-Confidence
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {confidence.overall >= 0.8
                ? "Hohe Zuverlässigkeit"
                : confidence.overall >= 0.5
                  ? "Einige Felder unsicher – bitte prüfen"
                  : "Viele unsichere Felder – bitte sorgfältig prüfen"}
            </p>
          </div>
        </div>
      )}

      {/* Kontaktdaten */}
      <div className="card p-4 mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Kontaktdaten
        </h2>
        <div className="space-y-3">
          {FIELD_CONFIG.map((field) => {
            if (field.key === "companyName" && !isCompany) return null;
            const value = (formData[field.key] as string) ?? "";
            const conf = confidence?.[field.key];

            if (field.type === "select") {
              return (
                <label key={field.key} className="block">
                  <span className="text-xs text-[var(--text-secondary)] flex items-center">
                    {field.label}
                    <ConfidenceDot score={conf} />
                  </span>
                  <select
                    value={value}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <label key={field.key} className="block">
                <span className="text-xs text-[var(--text-secondary)] flex items-center">
                  {field.label}
                  <ConfidenceDot score={conf} />
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                  placeholder={`${field.label}…`}
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Adresse */}
      <div className="card p-4 mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center">
          Adresse
          <ConfidenceDot score={confidence?.address} />
        </h2>
        <div className="space-y-3">
          {ADDRESS_FIELDS.map((field) => {
            const addr = formData.address || {};
            const value = (addr as Record<string, string | null>)[field.key] ?? "";
            return (
              <label key={field.key} className="block">
                <span className="text-xs text-[var(--text-secondary)]">{field.label}</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateNestedField("address", field.key, e.target.value)}
                  className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                  placeholder={`${field.label}…`}
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Ansprechpartner (nur bei Firma) */}
      {isCompany && (
        <div className="card p-4 mb-4">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center">
            Ansprechpartner
            <ConfidenceDot score={confidence?.contactPerson} />
          </h2>
          <div className="space-y-3">
            {CONTACT_PERSON_FIELDS.map((field) => {
              const cp = formData.contactPerson || {};
              const value = (cp as Record<string, string | null>)[field.key] ?? "";

              if (field.type === "select") {
                return (
                  <label key={field.key} className="block">
                    <span className="text-xs text-[var(--text-secondary)]">{field.label}</span>
                    <select
                      value={value}
                      onChange={(e) => updateNestedField("contactPerson", field.key, e.target.value)}
                      className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <label key={field.key} className="block">
                  <span className="text-xs text-[var(--text-secondary)]">{field.label}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateNestedField("contactPerson", field.key, e.target.value)}
                    className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                    placeholder={`${field.label}…`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Aktionen */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleDiscard}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors"
          disabled={saving}
        >
          Verwerfen
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || !canSubmit}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="spinner w-4 h-4" />
              Lege an…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Bestätigen & Anlegen
            </>
          )}
        </button>
      </div>
    </div>
  );
}
