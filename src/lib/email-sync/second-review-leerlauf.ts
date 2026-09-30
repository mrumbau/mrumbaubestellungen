/**
 * Leerlauf-Bremse fuer den Second-Review-Re-Run (30.09.2026).
 *
 * Gemessen an der Produktion, Stand heute:
 *   535 Second-Reviews insgesamt
 *   404 davon haben den First-Pass bestaetigt (kostet nur den billigen
 *       Metadaten-Check, ~0,001 $ — voellig in Ordnung)
 *   131 Widersprueche, die jeweils einen VOLLEN Pipeline-Re-Run ausgeloest
 *       haben (Graph-Fetch + OCR + GPT — der teure Teil)
 *     davon 8 mit Erfolg, alle aelter als 60 Tage
 *     davon 100 ohne jedes Ergebnis
 *   In den letzten 60 Tagen: 38 Re-Runs, 0 Erfolge.
 *
 * Der Metadaten-Review selbst ist also nicht das Problem, die blinden
 * Re-Runs sind es. Und sie sind vorhersagbar: stark-deutschland.de hat
 * 18 Re-Runs ohne einen einzigen Treffer, raabkarcher.de 6, kraft-baustoffe
 * 5. Das sind Haendler mit eigenem Parser — wenn der beim ersten Mal nichts
 * gefunden hat, findet der identische Lauf beim zweiten Mal auch nichts.
 *
 * Diese Bremse ist bewusst deterministisch und lernt aus den eigenen Daten
 * statt aus einem Modell: eine Absender-Domain, die schon MIN_LEERLAUF
 * ergebnislose Re-Runs und noch nie einen Treffer hatte, wird nicht mehr
 * neu gefahren. Der Review selbst laeuft weiter und wird protokolliert —
 * sichtbar bleibt der Verdacht also, nur der teure Lauf entfaellt.
 *
 * Selbstheilend: ein einziger Treffer auf der Domain hebt die Sperre
 * dauerhaft auf, weil `treffer > 0` sie sofort ausschliesst.
 */

/** Ab so vielen ergebnislosen Re-Runs ohne einen einzigen Treffer wird gebremst. */
export const MIN_LEERLAUF = 3;

/** Der einzige Ausgang, der als Treffer zaehlt. */
export const TREFFER_OUTCOME = "rerun_success_bestellung_angelegt";

/** Ausgang, der eine gebremste Mail markiert — taucht so in der Qualitaetsansicht auf. */
export const LEERLAUF_OUTCOME = "rerun_uebersprungen_leerlauf";

export type LeerlaufBilanz = Map<string, { treffer: number; leerlauf: number }>;

export type BilanzZeile = {
  sender: string | null;
  second_review_rerun_outcome: string | null;
};

/**
 * Absender-Domain in Kleinschreibung, oder null wenn keine erkennbar ist.
 * Ohne Domain gibt es nichts zu bremsen — solche Mails laufen normal weiter.
 */
export function domainAus(sender: string | null | undefined): string | null {
  if (!sender) return null;
  const at = sender.lastIndexOf("@");
  if (at < 0) return null;
  const domain = sender.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

/** Baut die Bilanz je Domain aus den bisherigen Re-Run-Ausgaengen. */
export function bauLeerlaufBilanz(zeilen: readonly BilanzZeile[]): LeerlaufBilanz {
  const bilanz: LeerlaufBilanz = new Map();
  for (const z of zeilen) {
    const outcome = z.second_review_rerun_outcome;
    // Ohne Ausgang gab es keinen Re-Run — die Zeile sagt nichts ueber Leerlauf.
    if (!outcome) continue;
    const domain = domainAus(z.sender);
    if (!domain) continue;
    const eintrag = bilanz.get(domain) ?? { treffer: 0, leerlauf: 0 };
    if (outcome === TREFFER_OUTCOME) eintrag.treffer++;
    else eintrag.leerlauf++;
    bilanz.set(domain, eintrag);
  }
  return bilanz;
}

/**
 * Soll der teure Re-Run fuer diesen Absender uebersprungen werden?
 *
 * Nur wenn die Domain nachweislich nie etwas gebracht hat. Ein einziger
 * Treffer in der Historie genuegt, um wieder zu fahren — lieber ein
 * ueberfluessiger Lauf als eine verlorene Rechnung.
 */
export function ueberspringeReRun(
  bilanz: LeerlaufBilanz,
  sender: string | null | undefined,
): boolean {
  const domain = domainAus(sender);
  if (!domain) return false;
  const eintrag = bilanz.get(domain);
  if (!eintrag) return false;
  return eintrag.treffer === 0 && eintrag.leerlauf >= MIN_LEERLAUF;
}
