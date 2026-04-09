"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTransitionRouter } from "next-view-transitions";
import type {
  CardScanCapture,
  ExtractedContactData,
} from "@/lib/cardscan/types";

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  success: { label: "Erfolgreich angelegt", color: "text-emerald-700" },
  partial_success: { label: "Teilweise angelegt", color: "text-amber-700" },
  failed: { label: "Fehlgeschlagen", color: "text-red-700" },
  review: { label: "In Prüfung", color: "text-blue-700" },
  discarded: { label: "Verworfen", color: "text-slate-500" },
};

function CrmBadge({ status, label }: { status: string | null; label: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Erstellt" },
    failed: { bg: "bg-red-50", text: "text-red-700", label: "Fehlgeschlagen" },
    skipped: { bg: "bg-slate-50", text: "text-slate-600", label: "Dry-Run" },
    pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Ausstehend" },
  };
  const s = config[status || "pending"] || config.pending;
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-[var(--radius-sm)] font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="py-2 flex justify-between gap-4">
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--text-primary)] text-right">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useTransitionRouter();
  const [capture, setCapture] = useState<CardScanCapture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/cardscan/captures/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCapture(json.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="spinner w-8 h-8 mx-auto" />
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="text-sm text-red-600">Eintrag nicht gefunden.</p>
        <button
          onClick={() => router.push("/cardscan/history")}
          className="mt-4 text-sm text-[var(--text-secondary)] underline"
        >
          Zurück zur Historie
        </button>
      </div>
    );
  }

  const data: ExtractedContactData | null =
    capture.final_data || capture.extracted_data;
  const statusInfo = STATUS_DISPLAY[capture.status] || STATUS_DISPLAY.review;

  const displayName = data
    ? data.customer_type === "company"
      ? data.companyName || [data.firstName, data.lastName].filter(Boolean).join(" ")
      : [data.firstName, data.lastName].filter(Boolean).join(" ")
    : "Unbekannt";

  return (
    <div className="max-w-xl mx-auto pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight">
          {displayName || "Kontaktdetails"}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {formatDate(capture.created_at)}
          </span>
        </div>
      </div>

      {/* CRM-Status */}
      {(capture.crm1_status || capture.crm2_status) && (
        <div className="card p-4 mb-4">
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            CRM-Status
          </h2>
          <CrmBadge status={capture.crm1_status} label="CRM 1" />
          {capture.crm1_reference_number && (
            <p className="text-xs text-[var(--text-tertiary)] mb-1">
              Kundennr.: {capture.crm1_reference_number}
            </p>
          )}
          <div className="border-t border-[var(--border-subtle)] my-1.5" />
          <CrmBadge status={capture.crm2_status} label="CRM 2" />
          {capture.crm2_reference_number && (
            <p className="text-xs text-[var(--text-tertiary)]">
              Kundennr.: {capture.crm2_reference_number}
            </p>
          )}
        </div>
      )}

      {/* Kontaktdaten (read-only) */}
      {data && (
        <>
          <div className="card p-4 mb-4">
            <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Kontaktdaten
            </h2>
            <div className="divide-y divide-[var(--border-subtle)]">
              <FieldRow
                label="Typ"
                value={
                  data.customer_type === "company"
                    ? "Firma"
                    : data.customer_type === "publicSector"
                      ? "Öffentliche Hand"
                      : "Privatperson"
                }
              />
              <FieldRow label="Firma" value={data.companyName} />
              <FieldRow label="Titel" value={data.title} />
              <FieldRow label="Vorname" value={data.firstName} />
              <FieldRow label="Nachname" value={data.lastName} />
              <FieldRow label="E-Mail" value={data.email} />
              <FieldRow label="Telefon" value={data.phone} />
              <FieldRow label="Mobil" value={data.mobile} />
              <FieldRow label="Fax" value={data.fax} />
              <FieldRow label="Webseite" value={data.website} />
              <FieldRow label="USt-IdNr." value={data.vatId} />
              <FieldRow label="Notizen" value={data.notes} />
            </div>
          </div>

          {data.address && (data.address.street || data.address.city) && (
            <div className="card p-4 mb-4">
              <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Adresse
              </h2>
              <div className="divide-y divide-[var(--border-subtle)]">
                <FieldRow label="Straße" value={data.address.street} />
                <FieldRow label="Hausnr." value={data.address.houseNumber} />
                <FieldRow label="PLZ" value={data.address.zip} />
                <FieldRow label="Stadt" value={data.address.city} />
                <FieldRow label="Land" value={data.address.countryCode} />
              </div>
            </div>
          )}

          {data.contactPerson &&
            (data.contactPerson.firstName || data.contactPerson.lastName) && (
              <div className="card p-4 mb-4">
                <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Ansprechpartner
                </h2>
                <div className="divide-y divide-[var(--border-subtle)]">
                  <FieldRow label="Vorname" value={data.contactPerson.firstName} />
                  <FieldRow label="Nachname" value={data.contactPerson.lastName} />
                  <FieldRow label="Position" value={data.contactPerson.role} />
                  <FieldRow label="E-Mail" value={data.contactPerson.email} />
                  <FieldRow label="Telefon" value={data.contactPerson.phone} />
                  <FieldRow label="Mobil" value={data.contactPerson.mobile} />
                </div>
              </div>
            )}
        </>
      )}

      {/* Zurück */}
      <button
        onClick={() => router.push("/cardscan/history")}
        className="w-full py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors mt-2"
      >
        ← Zurück zur Historie
      </button>
    </div>
  );
}
