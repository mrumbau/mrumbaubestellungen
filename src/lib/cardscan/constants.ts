// CardScan Module – Konstanten

export const CARDSCAN_STORAGE_BUCKET = "cardscan-images";

export const CARDSCAN_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
