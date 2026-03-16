// Validierungs-Utilities für API-Routen

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

export function isFileSizeOk(base64: string): boolean {
  // Base64 encoding increases size by ~33%, so decoded size ≈ base64.length * 3/4
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  return estimatedBytes <= MAX_FILE_SIZE_BYTES;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function validateTextLength(text: string, maxLength: number): boolean {
  return text.length <= maxLength;
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain) && domain.length <= 253;
}

const KUERZEL_REGEX = /^[A-Z]{2,5}$/;

export function isValidKuerzel(kuerzel: string): boolean {
  return KUERZEL_REGEX.test(kuerzel);
}
