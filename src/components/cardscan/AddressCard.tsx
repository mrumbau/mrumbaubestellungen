"use client";

import { ConfidenceBadge } from "@/components/cardscan/ConfidenceBadge";
import type { ExtractedAddress, ConfidenceScores } from "@/lib/cardscan/types";

const COUNTRY_OPTIONS = [
  { value: "DE", label: "Deutschland" },
  { value: "AT", label: "Österreich" },
  { value: "CH", label: "Schweiz" },
  { value: "NL", label: "Niederlande" },
  { value: "BE", label: "Belgien" },
  { value: "FR", label: "Frankreich" },
  { value: "IT", label: "Italien" },
  { value: "PL", label: "Polen" },
  { value: "LU", label: "Luxemburg" },
  { value: "DK", label: "Dänemark" },
];

const TEXT_FIELDS = [
  { key: "street", label: "Straße" },
  { key: "houseNumber", label: "Hausnummer" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Stadt" },
];

interface AddressCardProps {
  address: ExtractedAddress | null;
  confidence: ConfidenceScores | null;
  onChange: (key: string, value: string) => void;
}

export function AddressCard({ address, confidence, onChange }: AddressCardProps) {
  const addr = address || {};
  const countryValue =
    ((addr as Record<string, string | null>).countryCode ?? "")?.toUpperCase() || "";
  const isCustomCountry = countryValue !== "" && !COUNTRY_OPTIONS.some((c) => c.value === countryValue);

  return (
    <div className="card p-4 mb-4">
      <h2 className="text-body-sm font-medium text-foreground-muted uppercase tracking-wider mb-4 flex items-center">
        Adresse
        <ConfidenceBadge score={confidence?.address} />
      </h2>
      <div className="space-y-3">
        {TEXT_FIELDS.map((field) => {
          const value =
            (addr as Record<string, string | null>)[field.key] ?? "";
          return (
            <label key={field.key} className="block">
              <span className="text-meta text-foreground-muted">
                {field.label}
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-body focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                placeholder={`${field.label}…`}
              />
            </label>
          );
        })}

        {/* CU23: Land als Select statt Freitext-ISO-Code */}
        <label className="block">
          <span className="text-meta text-foreground-muted">Land</span>
          <select
            value={isCustomCountry ? "__other__" : countryValue}
            onChange={(e) => {
              if (e.target.value === "__other__") {
                onChange("countryCode", "");
              } else {
                onChange("countryCode", e.target.value);
              }
            }}
            className="mt-1 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-body focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <option value="">— bitte wählen —</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            <option value="__other__">Andere…</option>
          </select>
          {(isCustomCountry || countryValue === "") && (
            <input
              type="text"
              value={isCustomCountry ? countryValue : ""}
              onChange={(e) => onChange("countryCode", e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="ISO-Code (z.B. ES, GB)"
              className="mt-2 w-full py-2.5 px-3 rounded-md border border-line bg-input text-foreground text-body uppercase focus:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            />
          )}
        </label>
      </div>
    </div>
  );
}
