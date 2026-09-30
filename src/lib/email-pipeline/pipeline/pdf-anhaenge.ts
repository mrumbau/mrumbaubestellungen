/**
 * Eingebettete Dateien aus einem PDF holen (30.09.2026).
 *
 * Anlass: Der ZUGFeRD-Zweig in xrechnung.ts rief `pdfDoc.getAttachments()`
 * auf — eine Methode, die es in pdf-lib nicht gibt und nie gab (1.17.1:
 * `attach` zum Schreiben, nichts zum Lesen). Der Aufruf war mit `?.() ?? []`
 * abgesichert, lieferte also immer eine leere Liste. Ergebnis: in sechs
 * Monaten und 750 Belegen wurde keine einzige E-Rechnung strukturiert
 * gelesen (hoechste Konfidenz im Bestand: 0,98 — die 1,00 des XML-Pfads
 * kommt kein einziges Mal vor). Jede ZUGFeRD-Rechnung lief stattdessen
 * durch die KI: teurer, und mit der Moeglichkeit, Betraege zu raten,
 * obwohl sie exakt im Dokument stehen.
 *
 * ZUGFeRD ist genau dieser Fall — ein voellig normal aussehendes PDF mit
 * einer XML-Datei darin. Ohne Lesen der eingebetteten Dateien ist der
 * gesamte E-Rechnungs-Pfad praktisch auf reine XML-Anhaenge beschraenkt,
 * und die sind in der Praxis die Ausnahme.
 *
 * Deshalb hier der Weg ueber die PDF-Struktur selbst:
 *   Catalog → /Names → /EmbeddedFiles (Name-Tree, ggf. ueber /Kids
 *   verschachtelt) → Filespec → /EF → /F → Stream
 * und zusaetzlich ueber /AF (Associated Files), das ZUGFeRD ab Version 2
 * ohnehin verlangt und das manche Erzeuger als einzigen Eintrag setzen.
 */

import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFRawStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
} from "pdf-lib";

export interface EingebetteteDatei {
  name: string;
  inhalt: Buffer;
}

/** Schutz gegen zyklische oder absurd tiefe Name-Trees. */
const MAX_TIEFE = 8;
/** Mehr eingebettete Dateien als das schaut sich niemand mehr an. */
const MAX_DATEIEN = 25;

function alsText(wert: unknown): string | null {
  if (wert instanceof PDFString || wert instanceof PDFHexString) return wert.decodeText();
  return null;
}

/** Liest den Dateinamen aus einem Filespec — /UF gewinnt, weil Unicode. */
function dateiname(filespec: PDFDict): string {
  return (
    alsText(filespec.lookup(PDFName.of("UF"))) ??
    alsText(filespec.lookup(PDFName.of("F"))) ??
    ""
  );
}

/** Holt den eigentlichen Datenstrom eines Filespec, entpackt (FlateDecode). */
function inhaltVon(filespec: PDFDict): Buffer | null {
  const ef = filespec.lookup(PDFName.of("EF"));
  if (!(ef instanceof PDFDict)) return null;
  // /F ist der Regelfall; /UF und /DOS kommen bei aelteren Erzeugern vor.
  for (const schluessel of ["F", "UF", "DOS", "Mac", "Unix"]) {
    const strom = ef.lookup(PDFName.of(schluessel));
    if (strom instanceof PDFRawStream) {
      try {
        return Buffer.from(decodePDFRawStream(strom).decode());
      } catch {
        // Unbekannter Filter oder kaputter Strom — naechster Schluessel.
      }
    }
  }
  return null;
}

/** Laeuft den /EmbeddedFiles-Name-Tree ab und sammelt die Filespecs ein. */
function sammleAusNameTree(knoten: PDFDict, ziel: PDFDict[], tiefe = 0): void {
  if (tiefe > MAX_TIEFE || ziel.length >= MAX_DATEIEN) return;

  const namen = knoten.lookup(PDFName.of("Names"));
  if (namen instanceof PDFArray) {
    // Aufbau ist [name1, filespec1, name2, filespec2, ...] — nur die
    // ungeraden Positionen sind Filespecs.
    for (let i = 1; i < namen.size() && ziel.length < MAX_DATEIEN; i += 2) {
      const eintrag = namen.lookup(i);
      if (eintrag instanceof PDFDict) ziel.push(eintrag);
    }
  }

  const kinder = knoten.lookup(PDFName.of("Kids"));
  if (kinder instanceof PDFArray) {
    for (let i = 0; i < kinder.size() && ziel.length < MAX_DATEIEN; i++) {
      const kind = kinder.lookup(i);
      if (kind instanceof PDFDict) sammleAusNameTree(kind, ziel, tiefe + 1);
    }
  }
}

/**
 * Alle eingebetteten Dateien eines PDF.
 *
 * Wirft nicht: ein kaputtes, verschluesseltes oder gar nicht als PDF
 * gemeintes Dokument ergibt eine leere Liste. Der Aufrufer faellt dann auf
 * seinen bisherigen Weg zurueck.
 */
export async function ladeEingebetteteDateien(pdf: Buffer): Promise<EingebetteteDatei[]> {
  let dokument: PDFDocument;
  try {
    dokument = await PDFDocument.load(pdf, { ignoreEncryption: true, throwOnInvalidObject: false });
  } catch {
    return [];
  }

  const filespecs: PDFDict[] = [];
  try {
    const katalog = dokument.catalog;

    const namen = katalog.lookup(PDFName.of("Names"));
    if (namen instanceof PDFDict) {
      const eingebettet = namen.lookup(PDFName.of("EmbeddedFiles"));
      if (eingebettet instanceof PDFDict) sammleAusNameTree(eingebettet, filespecs);
    }

    // /AF — ZUGFeRD 2.x verlangt das ohnehin, und manche Erzeuger setzen
    // ausschliesslich diesen Eintrag.
    const af = katalog.lookup(PDFName.of("AF"));
    if (af instanceof PDFArray) {
      for (let i = 0; i < af.size() && filespecs.length < MAX_DATEIEN; i++) {
        const eintrag = af.lookup(i);
        if (eintrag instanceof PDFDict && !filespecs.includes(eintrag)) filespecs.push(eintrag);
      }
    }
  } catch {
    return [];
  }

  const dateien: EingebetteteDatei[] = [];
  for (const spec of filespecs) {
    const inhalt = inhaltVon(spec);
    if (!inhalt) continue;
    dateien.push({ name: dateiname(spec), inhalt });
  }
  return dateien;
}
