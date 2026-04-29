// CardScan Module – Konstanten

export const CARDSCAN_STORAGE_BUCKET = "cardscan-images";

export const CARDSCAN_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
// R2/F7.16: Pre-Vision Hard-Cap. Bilder über diese Größe werden vor dem
// Google-Vision-Call abgelehnt — verhindert teure OCR-Calls auf XL-Fotos.
// Client komprimiert ohnehin auf 1920px JPEG-q0.85 (~500KB-1MB), das ist
// der erwartete Eingang.
export const CARDSCAN_VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const CARDSCAN_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const CARDSCAN_ALLOWED_FILE_TYPES = [
  ...CARDSCAN_ALLOWED_MIME_TYPES,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/vcard", // .vcf
] as const;

export const CARDSCAN_RATE_LIMIT = {
  MAX_REQUESTS: 20,
  WINDOW_MS: 60_000, // 1 Minute
} as const;

export const DAS_PROGRAMM_ENDPOINT = "https://app.das-programm.io/api/graphql";
