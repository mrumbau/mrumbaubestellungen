// Tracking-URL-Templates für bekannte Versanddienstleister

const TEMPLATES: Record<string, (nr: string) => string> = {
  DHL: (nr) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(nr)}`,
  DPD: (nr) => `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(nr)}`,
  Hermes: (nr) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${encodeURIComponent(nr)}`,
  UPS: (nr) => `https://www.ups.com/track?tracknum=${encodeURIComponent(nr)}`,
  GLS: (nr) => `https://gls-group.com/DE/de/sendungsverfolgung?match=${encodeURIComponent(nr)}`,
  FedEx: (nr) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(nr)}`,
};

/**
 * Konstruiert eine Tracking-URL aus Dienstleister + Sendungsnummer.
 * Gibt null zurück wenn der Dienstleister unbekannt ist.
 */
export function buildTrackingUrl(dienstleister: string, nummer: string): string | null {
  const key = Object.keys(TEMPLATES).find(
    (k) => k.toLowerCase() === dienstleister.trim().toLowerCase()
  );
  if (!key) return null;
  return TEMPLATES[key](nummer.trim());
}
