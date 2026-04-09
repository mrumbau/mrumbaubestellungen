"use client";

import { ConfidenceBadge } from "@/components/cardscan/ConfidenceBadge";
import type { ExtractedAddress, ConfidenceScores } from "@/lib/cardscan/types";

const ADDRESS_FIELDS = [
  { key: "street", label: "Straße" },
  { key: "houseNumber", label: "Hausnummer" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Stadt" },
  { key: "countryCode", label: "Land (ISO)" },
];

interface AddressCardProps {
  address: ExtractedAddress | null;
  confidence: ConfidenceScores | null;
  onChange: (key: string, value: string) => void;
}

export function AddressCard({ address, confidence, onChange }: AddressCardProps) {
  const addr = address || {};

  return (
    <div className="card p-4 mb-4">
      <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center">
        Adresse
        <ConfidenceBadge score={confidence?.address} />
      </h2>
      <div className="space-y-3">
        {ADDRESS_FIELDS.map((field) => {
          const value =
            (addr as Record<string, string | null>)[field.key] ?? "";
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
