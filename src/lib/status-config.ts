// Status-Konfiguration – eckige Tags mit linkem Farbbalken

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  erwartet: { label: "Erwartet", color: "#8b8b8b", bg: "bg-[#f5f5f5]", text: "text-[#6b6b6b]" },
  offen: { label: "Offen", color: "#2563eb", bg: "bg-blue-50", text: "text-blue-700" },
  vollstaendig: { label: "Vollständig", color: "#16a34a", bg: "bg-green-50", text: "text-green-700" },
  abweichung: { label: "Abweichung", color: "#dc2626", bg: "bg-red-50", text: "text-red-700" },
  ls_fehlt: { label: "LS fehlt", color: "#d97706", bg: "bg-amber-50", text: "text-amber-700" },
  freigegeben: { label: "Freigegeben", color: "#059669", bg: "bg-emerald-50", text: "text-emerald-700" },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offen;
}
