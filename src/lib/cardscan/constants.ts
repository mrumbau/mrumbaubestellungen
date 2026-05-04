// CardScan Module – Konstanten

export const CARDSCAN_STORAGE_BUCKET = "cardscan-images";

export const CARDSCAN_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
// R2/F7.16: Pre-Vision Hard-Cap. Bilder über diese Größe werden vor dem
// Google-Vision-Call abgelehnt — verhindert teure OCR-Calls auf XL-Fotos.
// Client komprimiert ohnehin auf 1920px JPEG-q0.85 (~500KB-1MB), das ist
// der erwartete Eingang.
export const CARDSCAN_VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Client-side akzeptierte MIME-Types fürs File-Picker-Filter.
 * HEIC ist hier NUR weil der Client (heic2any) es vor Upload zu JPEG konvertiert
 * — die SERVER-Route akzeptiert nur jpeg/png/webp (siehe extract/route.ts IMAGE_TYPES).
 *
 * F7.13: Diskrepanz ist gewollt. Falls jemals server-side HEIC unterstützen,
 * MÜSSTE sharp oder imagemagick installiert werden, dann auch IMAGE_TYPES erweitern.
 */
export const CARDSCAN_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

/** F7.13: Server-side IMAGE-Whitelist (HEIC EXKLUDIERT — Client muss vor Upload konvertieren). */
export const CARDSCAN_SERVER_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CARDSCAN_ALLOWED_FILE_TYPES = [
  ...CARDSCAN_ALLOWED_MIME_TYPES,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/vcard", // .vcf
] as const;

/** Generischer Rate-Limit Default (für non-spezialisierte Endpoints). */
export const CARDSCAN_RATE_LIMIT = {
  MAX_REQUESTS: 20,
  WINDOW_MS: 60_000, // 1 Minute
} as const;

/**
 * F7.5: Differenzierte Rate-Limits pro Source-Type.
 * Image (Vision+GPT) ist teurer als Text — eigene strengere Limits.
 * Daily-Cap auf Tagesbasis (vision-quota.ts) bleibt zusätzlich aktiv.
 */
export const CARDSCAN_RATE_LIMITS_BY_TYPE = {
  text: { MAX_REQUESTS: 30, WINDOW_MS: 60_000 },
  image: { MAX_REQUESTS: 10, WINDOW_MS: 60_000 },
  pdf: { MAX_REQUESTS: 10, WINDOW_MS: 60_000 },
  docx: { MAX_REQUESTS: 10, WINDOW_MS: 60_000 },
  vcard: { MAX_REQUESTS: 30, WINDOW_MS: 60_000 },
  url: { MAX_REQUESTS: 10, WINDOW_MS: 60_000 },
} as const;

export const DAS_PROGRAMM_ENDPOINT = "https://app.das-programm.io/api/graphql";

/**
 * UI-Labels für die zwei das-programm.io CRM-Mandanten.
 * Backend-Identifier "CRM1"/"CRM2" bleiben in Logger und Token-Slot-Names
 * unverändert — diese Labels sind nur für die Anzeige im Frontend.
 */
export const CRM_LABELS = {
  crm1: "CRM MR Umbau",
  crm2: "CRM Manufactur Raumcultur",
} as const;
