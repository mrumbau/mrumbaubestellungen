"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  CardScanCapture,
  ExtractedContactData,
  ConfidenceScores,
  DuplicateMatch,
} from "@/lib/cardscan/types";
import { ConfidenceBadge, ConfidenceOverview } from "@/components/cardscan/ConfidenceBadge";
import { DuplicateWarning } from "@/components/cardscan/DuplicateWarning";
import { ContactFieldsCard } from "@/components/cardscan/ContactFieldsCard";
import { AddressCard } from "@/components/cardscan/AddressCard";
import { ContactPersonCard } from "@/components/cardscan/ContactPersonCard";
import { ReviewActions } from "@/components/cardscan/ReviewActions";

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

  // ─── Data Loading ─────────────────────────────────────────────────

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

  // ─── Field Updates ────────────────────────────────────────────────

  function updateField(key: string, value: string) {
    if (!formData) return;
    setFormData({ ...formData, [key]: value || null });
  }

  function updateAddressField(key: string, value: string) {
    if (!formData) return;
    const current = formData.address || {};
    setFormData({
      ...formData,
      address: { ...current, [key]: value || null } as ExtractedContactData["address"],
    });
  }

  function updateContactPersonField(key: string, value: string) {
    if (!formData) return;
    const current = formData.contactPerson || {};
    setFormData({
      ...formData,
      contactPerson: { ...current, [key]: value || null } as ExtractedContactData["contactPerson"],
    });
  }

  // ─── Actions ──────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!formData) return;

    // Duplikat vorhanden aber keine Aktion gewählt
    if (duplicates.length > 0 && dupAction === "none") {
      setError("Bitte wähle 'Daten ergänzen' oder 'Trotzdem neu anlegen'.");
      return;
    }

    // Update-Flow: bestehenden Kunden aktualisieren
    if (dupAction === "update" && updateTarget) {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/cardscan/update-customer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crm: updateTarget.crm,
            customer_id: updateTarget.customerId,
            final_data: formData,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Update fehlgeschlagen.");
          setSaving(false);
          return;
        }
        router.push(`/cardscan/success/${id}`);
        return;
      } catch {
        setError("Verbindungsfehler beim Kunden-Update.");
        setSaving(false);
        return;
      }
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
          duplicate_override: dupAction === "override",
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

  // ─── Loading State ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="skeleton-text w-1/3 h-7 mb-2" />
        <div className="skeleton-text w-2/3 h-4 mb-6" />
        <div className="card p-3 mb-6 flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-[var(--radius-md)]" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-text w-1/2" />
            <div className="skeleton-text w-3/4 h-[0.75em]" />
          </div>
        </div>
        <div className="card p-4 mb-4 space-y-4">
          <div className="skeleton-text w-1/4 h-3" />
          {[...Array(6)].map((_, i) => (
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

  // ─── Error State ──────────────────────────────────────────────────

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
  const canSubmit = !hasDuplicates || dupAction !== "none";

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto pb-8">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-1">
        Daten prüfen
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Prüfe die erkannten Daten und korrigiere bei Bedarf.
        <span className="inline-flex items-center ml-2">
          <ConfidenceBadge score={0.6} />
          <span className="text-xs ml-0.5">unsicher</span>
          <ConfidenceBadge score={0.3} />
          <span className="text-xs ml-0.5">sehr unsicher</span>
        </span>
      </p>

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
        onUpdate={(match) => {
          setDupAction("update");
          setUpdateTarget(match);
        }}
        action={dupAction}
      />

      {/* Confidence */}
      {confidence && <ConfidenceOverview overall={confidence.overall} />}

      {/* Felder */}
      <ContactFieldsCard
        data={formData}
        confidence={confidence}
        onChange={updateField}
      />

      <AddressCard
        address={formData.address}
        confidence={confidence}
        onChange={updateAddressField}
      />

      {isCompany && (
        <ContactPersonCard
          contactPerson={formData.contactPerson}
          confidence={confidence}
          onChange={updateContactPersonField}
        />
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Aktionen */}
      <ReviewActions
        onConfirm={handleConfirm}
        onDiscard={handleDiscard}
        saving={saving}
        canSubmit={canSubmit}
      />
    </div>
  );
}
