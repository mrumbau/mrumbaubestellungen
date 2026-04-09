"use client";

import { ConfidenceBadge } from "@/components/cardscan/ConfidenceBadge";
import type { ExtractedContactPerson, ConfidenceScores } from "@/lib/cardscan/types";

const FIELDS: {
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

interface ContactPersonCardProps {
  contactPerson: ExtractedContactPerson | null;
  confidence: ConfidenceScores | null;
  onChange: (key: string, value: string) => void;
}

export function ContactPersonCard({
  contactPerson,
  confidence,
  onChange,
}: ContactPersonCardProps) {
  const cp = contactPerson || {};

  return (
    <div className="card p-4 mb-4">
      <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center">
        Ansprechpartner
        <ConfidenceBadge score={confidence?.contactPerson} />
      </h2>
      <div className="space-y-3">
        {FIELDS.map((field) => {
          const value =
            (cp as Record<string, string | null>)[field.key] ?? "";

          if (field.type === "select") {
            return (
              <label key={field.key} className="block">
                <span className="text-xs text-[var(--text-secondary)]">
                  {field.label}
                </span>
                <select
                  value={value}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
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
              <span className="text-xs text-[var(--text-secondary)]">
                {field.label}
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="mt-1 w-full py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)]"
                placeholder={`${field.label}…`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
