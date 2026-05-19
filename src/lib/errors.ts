/**
 * Standard-Fehlermeldungen für API-Routen (deutsch).
 *
 * 19.05.2026 (A4.16) — User-actionable Texte statt generisches "Fehler".
 * Jede Konstante enthält: WAS passiert ist + (wo sinnvoll) WAS der User tun kann.
 * Niemals nach Wert matchen (kein `=== ERRORS.X`) — Strings sind frei änderbar.
 */
export const ERRORS = {
  NICHT_AUTHENTIFIZIERT: "Du bist nicht eingeloggt. Bitte melde dich neu an.",
  KEINE_BERECHTIGUNG: "Für diese Aktion fehlt dir die Berechtigung.",
  KEIN_PROFIL: "Dein Benutzerprofil konnte nicht geladen werden. Bitte logge dich neu ein.",
  NICHT_GEFUNDEN: "Der angefragte Eintrag existiert nicht oder wurde gelöscht.",
  UNGUELTIGE_ID: "Die übergebene ID hat ein ungültiges Format.",
  UNGUELTIGER_URSPRUNG: "Anfrage von nicht erlaubtem Ursprung blockiert.",
  INTERNER_FEHLER: "Auf dem Server ist ein unerwarteter Fehler aufgetreten. Bitte später erneut versuchen.",
  ZU_VIELE_ANFRAGEN: "Zu viele Anfragen in kurzer Zeit. Bitte warte einen Moment und versuche es erneut.",
  UNGUELTIGE_AKTION: "Die angeforderte Aktion ist nicht erlaubt.",
} as const;
