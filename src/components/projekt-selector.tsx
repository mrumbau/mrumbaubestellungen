"use client";

import { useState } from "react";

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}

interface ProjektSelectorProps {
  projekte: ProjektOption[];
  currentProjektId: string | null;
  onSelect: (projektId: string | null) => void;
  disabled?: boolean;
}

export function ProjektSelector({ projekte, currentProjektId, onSelect, disabled = false }: ProjektSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs font-medium text-[#570006] hover:text-[#7a1a1f] border border-[#570006]/20 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
      >
        Projekt zuordnen
      </button>
    );
  }

  const verfuegbar = projekte.filter((p) => p.id !== currentProjektId);

  return (
    <div className="space-y-2">
      {verfuegbar.map((p) => (
        <button
          key={p.id}
          onClick={() => { onSelect(p.id); setOpen(false); }}
          disabled={disabled}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg border border-[#e8e6e3] hover:bg-[#fafaf9] transition-colors disabled:opacity-50"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.farbe }} />
          {p.name}
        </button>
      ))}
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors"
      >
        Abbrechen
      </button>
    </div>
  );
}
