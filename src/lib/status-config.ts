// Zentralisierte Status-Konfiguration

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  erwartet: { label: "Erwartet", bg: "bg-slate-100", text: "text-slate-600" },
  offen: { label: "Offen", bg: "bg-blue-50", text: "text-blue-700" },
  vollstaendig: { label: "Vollständig", bg: "bg-green-50", text: "text-green-700" },
  abweichung: { label: "Abweichung", bg: "bg-red-50", text: "text-red-700" },
  ls_fehlt: { label: "LS fehlt", bg: "bg-yellow-50", text: "text-yellow-700" },
  freigegeben: { label: "Freigegeben", bg: "bg-emerald-50", text: "text-emerald-700" },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offen;
}
