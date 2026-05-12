/**
 * Auth-Konstanten — Server-/Client-agnostisch.
 *
 * Bewusst getrennt von `@/lib/auth` weil dieses `next/headers` importiert
 * (Server-only). Client-Components dürfen `auth.ts` deshalb nicht
 * importieren — diese Datei hier können sie nutzen.
 *
 * 12.05.2026 (UI-Audit F6.10).
 */

/**
 * Mindestlänge für neue Passwörter.
 * Supabase erzwingt server-side ohnehin eine Mindestlänge; dieser Wert ist
 * die Client-Validation für sofortiges Feedback.
 */
export const PASSWORD_MIN_LENGTH = 8;
