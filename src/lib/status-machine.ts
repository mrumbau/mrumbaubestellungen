/**
 * Status-Machine für `bestellungen.status`.
 *
 * Audit-Findings F5.1 + F3.F9: Übergänge waren nicht enforced — bei
 * Re-Mail-Empfang oder Bug konnte eine bereits freigegebene Bestellung
 * zurück auf `vollstaendig` gesetzt werden, Audit-Spur verloren.
 *
 * Diese Datei macht die erlaubten Übergänge explizit + bietet Helpers,
 * die Code-Pfade nutzen können um Verstöße früh zu loggen oder zu
 * blockieren.
 *
 * Defense-in-Depth:
 *   1. Code-seitig: assertValidTransition() / isValidTransition()
 *   2. DB-seitig: Trigger `enforce_freigegeben_terminal` blockt
 *      freigegeben → ANY (außer freigegeben). Andere Übergänge bleiben
 *      bewusst code-validated, da der Pipeline-Code historisch auch
 *      Rückwärts-Übergänge wie vollstaendig→offen produziert (Doku-Löschung).
 */

import { logError } from "./logger";

export const BESTELL_STATUS = [
  "erwartet",
  "offen",
  "vollstaendig",
  "abweichung",
  "ls_fehlt",
  "freigegeben",
] as const;

export type BestellStatus = (typeof BESTELL_STATUS)[number];

/**
 * Erlaubte Status-Übergänge.
 *
 * Idempotente Selbst-Übergänge (X → X) sind immer erlaubt — viele Code-Pfade
 * machen idempotente UPDATEs.
 *
 * `freigegeben` ist Endzustand: kein outbound transition.
 */
export const ALLOWED_TRANSITIONS: Record<BestellStatus, readonly BestellStatus[]> = {
  erwartet: ["erwartet", "offen", "ls_fehlt"],
  // offen → offen ist erlaubt (idempotent), plus Pipeline kann zurück bei Doku-Löschung
  offen: ["offen", "vollstaendig", "abweichung", "ls_fehlt"],
  // vollstaendig kann zurück nach offen wenn Doku gelöscht wird (current pipeline behavior)
  vollstaendig: ["vollstaendig", "abweichung", "freigegeben", "offen", "ls_fehlt"],
  abweichung: ["abweichung", "vollstaendig", "freigegeben"],
  ls_fehlt: ["ls_fehlt", "offen", "vollstaendig", "abweichung", "freigegeben"],
  freigegeben: ["freigegeben"], // Endzustand — kein Rollback
};

export function isValidTransition(from: BestellStatus, to: BestellStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: BestellStatus): boolean {
  return status === "freigegeben";
}

/**
 * Prüft den Übergang + loggt bei Verstoß. Wirft NICHT — Caller entscheidet
 * ob er trotzdem fortfährt (z.B. Pipeline-Backwards-Compat) oder abbricht.
 *
 * Soll als Soft-Audit-Layer dienen während wir Code-Pfade migrieren. Sobald
 * das Logging ruhig ist, kann der Trigger auf alle Übergänge ausgeweitet
 * werden.
 */
export function checkTransition(
  from: BestellStatus | string | null | undefined,
  to: BestellStatus | string,
  context?: string,
): { valid: boolean; reason?: string } {
  if (!from || !BESTELL_STATUS.includes(from as BestellStatus)) {
    return { valid: true }; // unbekannter Ausgangs-Status (NULL initial) — durchlassen
  }
  if (!BESTELL_STATUS.includes(to as BestellStatus)) {
    const reason = `Unbekannter Ziel-Status: ${to}`;
    logError("status-machine", reason, { from, to, context });
    return { valid: false, reason };
  }
  const valid = isValidTransition(from as BestellStatus, to as BestellStatus);
  if (!valid) {
    const reason = `Ungültiger Status-Übergang ${from} → ${to}`;
    logError("status-machine", reason, { from, to, context });
    return { valid: false, reason };
  }
  return { valid: true };
}

/**
 * Strikte Variante — wirft bei ungültigem Übergang. Verwenden in Code-Pfaden
 * wo Backward-Compat nicht nötig ist (z.B. neue Endpoints).
 */
export function assertValidTransition(
  from: BestellStatus,
  to: BestellStatus,
  context?: string,
): void {
  const result = checkTransition(from, to, context);
  if (!result.valid) {
    throw new Error(result.reason ?? `Ungültiger Status-Übergang: ${from} → ${to}`);
  }
}
