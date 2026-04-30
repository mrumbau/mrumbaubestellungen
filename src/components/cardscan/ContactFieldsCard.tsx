"use client";

import { ConfidenceBadge } from "@/components/cardscan/ConfidenceBadge";
import type { ExtractedContactData, ConfidenceScores } from "@/lib/cardscan/types";

const FIELD_CONFIG: {
  key: keyof ExtractedContactData;
  label: string;
  type?: "select";
  options?: { value: string; label: string }[];
  companyOnly?: boolean;
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
  { key: "companyName", label: "Firma", companyOnly: true },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon (Festnetz)" },
  { key: "mobile", label: "Mobilnummer" },
  { key: "fax", label: "Fax" },
  { key: "website", label: "Webseite" },
  { key: "vatId", label: "USt-IdNr." },
  { key: "notes", label: "Notizen" },
];

interface ContactFieldsCardProps {
  data: ExtractedContactData;
  confidence: ConfidenceScores | null;
  onChange: (key: string, value: string) => void;
}

export function ContactFieldsCard({
  data,
  confidence,
  onChange,
}: ContactFieldsCardProps) {
  const isCompany = data.customer_type === "company";

  return (
    <div className="card p-4 mb-4">
      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wider mb-4">
        Kontaktdaten
      </h2>
      <div className="space-y-3">
        {FIELD_CONFIG.map((field) => {
          if (field.companyOnly && !isCompany) return null;
          const value = (data[field.key] as string) ?? "";
          const conf = confidence?.[field.key];

          if (field.type === "select") {
            return (
              <label key={field.key} className="block">
                <span className="text-xs text-foreground-muted flex items-center">
                  {field.label}
                  <ConfidenceBadge score={conf} />
                </span>
                <select
                  value={value}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          return (
            <label key={field.key} className="block">
              <span className="text-xs text-foreground-muted flex items-center">
                {field.label}
                <ConfidenceBadge score={conf} />
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-base focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                placeholder={`${field.label}…`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
