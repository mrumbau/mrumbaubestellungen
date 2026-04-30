"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";
import type {
  CardScanCapture,
  ExtractedContactData,
} from "@/lib/cardscan/types";

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  success: { label: "Erfolgreich angelegt", color: "text-cs-accent-text" },
  partial_success: { label: "Teilweise angelegt", color: "text-warning" },
  failed: { label: "Fehlgeschlagen", color: "text-error" },
  review: { label: "In Prüfung", color: "text-info" },
  discarded: { label: "Verworfen", color: "text-foreground-subtle" },
};

function CrmBadge({ status, label }: { status: string | null; label: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-cs-accent-tint", text: "text-cs-accent-text", label: "Erstellt" },
    failed: { bg: "bg-error-bg", text: "text-error", label: "Fehlgeschlagen" },
    skipped: { bg: "bg-slate-50", text: "text-slate-600", label: "Dry-Run" },
    pending: { bg: "bg-warning-bg", text: "text-warning", label: "Ausstehend" },
  };
  const s = config[status || "pending"] || config.pending;
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-foreground-muted">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="py-2 flex justify-between gap-4">
      <span className="text-xs text-foreground-subtle shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
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
  const router = useRouter();
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
      <div className="max-w-lg md:max-w-xl mx-auto py-20 text-center">
        <div className="spinner w-8 h-8 mx-auto" />
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="max-w-lg md:max-w-xl mx-auto py-20 text-center">
        <p className="text-sm text-error">Eintrag nicht gefunden.</p>
        <button
          onClick={() => router.push("/cardscan/history")}
          className="mt-4 text-sm text-foreground-muted underline"
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

  // Aktionen je nach Status (F5.7)
  const canContinueReview = capture.status === "review";
  const isFailed = capture.status === "failed" || capture.status === "partial_success";

  return (
    <div className="max-w-lg md:max-w-xl mx-auto pb-8 animate-fade-in">
      <BackLink href="/cardscan/history" label="Historie" />
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-headline text-xl text-foreground tracking-tight">
          {displayName || "Kontaktdetails"}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <span className="text-xs text-foreground-subtle">
            {formatDate(capture.created_at)}
          </span>
        </div>

        {/* Aktions-Bar */}
        {(canContinueReview || isFailed) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canContinueReview && (
              <button
                type="button"
                onClick={() => router.push(`/cardscan/review/${capture.id}`)}
                className="btn-primary px-4 py-2 rounded-md text-[13px] font-medium min-h-[44px] inline-flex items-center gap-1.5"
              >
                Bearbeitung fortsetzen
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            )}
            {isFailed && capture.raw_image_path && (
              <button
                type="button"
                onClick={() => router.push(`/cardscan/review/${capture.id}`)}
                className="px-4 py-2 rounded-md border border-line text-foreground hover:bg-surface-hover text-[13px] font-medium min-h-[44px] inline-flex items-center gap-1.5"
              >
                Erneut prüfen
              </button>
            )}
          </div>
        )}

        {/* Hinweis: 30-Tage-Retention für Bilder */}
        {(canContinueReview || isFailed) && (
          <p className="mt-2 text-[11px] text-foreground-subtle leading-relaxed">
            Bilder werden nach 30 Tagen automatisch gelöscht — danach ist eine Re-Analyse nicht mehr möglich.
          </p>
        )}
      </div>

      {/* CRM-Status */}
      {(capture.crm1_status || capture.crm2_status) && (
        <div className="card p-4 mb-4">
          <h2 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
            CRM-Status
          </h2>
          <CrmBadge status={capture.crm1_status} label="CRM 1" />
          {capture.crm1_reference_number && (
            <p className="text-xs text-foreground-subtle mb-1">
              Kundennr.: {capture.crm1_reference_number}
            </p>
          )}
          <div className="border-t border-line-subtle my-1.5" />
          <CrmBadge status={capture.crm2_status} label="CRM 2" />
          {capture.crm2_reference_number && (
            <p className="text-xs text-foreground-subtle">
              Kundennr.: {capture.crm2_reference_number}
            </p>
          )}
        </div>
      )}

      {/* Kontaktdaten (read-only) */}
      {data && (
        <>
          <div className="card p-4 mb-4">
            <h2 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
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
              <h2 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
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
                <h2 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
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

    </div>
  );
}
