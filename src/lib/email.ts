import nodemailer from "nodemailer";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { logError, logInfo } from "@/lib/logger";

const ROUTE = "/lib/email";

/**
 * F5.9 + DATEV-Polish: Stempelt eine PDF-Rechnung mit Bestellnr + Bezahlt-Info.
 * Nada bekommt damit eine "Annotated"-Version statt der rohen Händler-PDF.
 *
 * Stempel landet auf Seite 1 oben rechts (kollidiert nicht mit Logo/Header).
 * Bei Fehler (kaputte PDF, etc.): liefert Original zurück, niemand kann
 * den Bezahlt-Workflow blockieren.
 */
export async function stempelPdfMitDatev(
  pdfBuffer: Buffer,
  metadata: {
    bestellnummer: string | null;
    haendlerName: string | null;
    bezahltAm: Date;
    bezahltVon: string;
    betrag: number | null;
  },
): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return pdfBuffer;

    const page = pages[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Stempel-Box: oben rechts, ~50pt breit, 6 Zeilen
    const lines = [
      "BEZAHLT",
      `Datum: ${metadata.bezahltAm.toLocaleDateString("de-DE")}`,
      `Von: ${(metadata.bezahltVon || "—").slice(0, 30)}`,
      metadata.bestellnummer ? `Best.-Nr: ${metadata.bestellnummer.slice(0, 30)}` : null,
      metadata.haendlerName ? `Lieferant: ${metadata.haendlerName.slice(0, 35)}` : null,
      metadata.betrag != null ? `Betrag: ${metadata.betrag.toFixed(2)} €` : null,
    ].filter((l): l is string => !!l);

    const lineHeight = 11;
    const padding = 6;
    const boxHeight = lines.length * lineHeight + padding * 2;
    const boxWidth = 220;
    const boxX = width - boxWidth - 20;
    const boxY = height - boxHeight - 20;

    page.drawRectangle({
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      borderColor: rgb(0.1, 0.3, 0.55), // Mr-Umbau-Blue
      borderWidth: 1.5,
      color: rgb(0.97, 0.99, 1.0),
      opacity: 0.9,
    });

    let cursorY = boxY + boxHeight - padding - lineHeight + 2;
    for (let i = 0; i < lines.length; i++) {
      const isHeader = i === 0;
      page.drawText(lines[i], {
        x: boxX + padding,
        y: cursorY,
        size: isHeader ? 11 : 9,
        font: isHeader ? fontBold : font,
        color: isHeader ? rgb(0.1, 0.3, 0.55) : rgb(0.15, 0.15, 0.15),
      });
      cursorY -= lineHeight;
    }

    const stamped = await pdfDoc.save();
    return Buffer.from(stamped);
  } catch (err) {
    logError(ROUTE, "PDF-Stempelung fehlgeschlagen — Original wird verwendet", err);
    return pdfBuffer;
  }
}

// Microsoft 365 SMTP Transporter (bu@mrumbau.de)
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // STARTTLS wird automatisch ausgehandelt
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  });
}

const DATEV_UPLOAD_EMAIL = "3878e32b-99b1-49ea-a278-0ee7623039a6@uploadmail.datev.de";
const ABSENDER = "bu@mrumbau.de";
const FIRMA = "MR Umbau GmbH";

interface RechnungAnDatevOptions {
  bestellnummer: string | null;
  haendlerName: string;
  betrag: number | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

/**
 * Sendet eine Rechnungs-PDF an die DATEV Uploadmail-Adresse.
 * Wird automatisch ausgelöst wenn die Buchhaltung eine Rechnung als bezahlt markiert.
 */
export async function sendeRechnungAnDatev(options: RechnungAnDatevOptions): Promise<{ success: boolean; error?: string }> {
  const { bestellnummer, haendlerName, betrag, pdfBuffer } = options;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    logInfo(ROUTE, "DATEV-Mail SMTP nicht konfiguriert — Versand übersprungen");
    return { success: false, error: "SMTP nicht konfiguriert" };
  }

  // Sauberer Betreff — keine Sonderzeichen, kein Spam-verdächtiges Format
  const betreffTeile = ["Eingangsrechnung"];
  if (haendlerName) betreffTeile.push(haendlerName);
  if (bestellnummer) betreffTeile.push(`Nr. ${bestellnummer}`);
  const betreff = betreffTeile.join(" - ");

  // Sauberer PDF-Dateiname (keine Hashes/Timestamps)
  const saubererFilename = erstelleSauberenDateinamen(haendlerName, bestellnummer);

  // Betrag formatiert
  const betragText = betrag != null
    ? betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR"
    : "nicht angegeben";

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: { name: FIRMA, address: ABSENDER },
      to: DATEV_UPLOAD_EMAIL,
      replyTo: ABSENDER,
      subject: betreff,
      headers: {
        "X-Mailer": "MR-Umbau-Bestellsystem/1.0",
        "X-Auto-Response-Suppress": "All",
      },
      text: [
        `Eingangsrechnung von ${haendlerName}`,
        "",
        `Lieferant: ${haendlerName}`,
        `Bestellnummer: ${bestellnummer || "keine"}`,
        `Bruttobetrag: ${betragText}`,
        "",
        "Die Rechnung befindet sich im Anhang als PDF.",
        "",
        "Mit freundlichen Gruessen",
        FIRMA,
        "Buchhaltung",
      ].join("\n"),
      attachments: [
        {
          filename: saubererFilename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    logInfo(ROUTE, `DATEV-Mail Rechnung gesendet`, { haendlerName, bestellnummer });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    logError(ROUTE, "DATEV-Mail Fehler", err);
    return { success: false, error: msg };
  }
}

interface MahnungEmailOptions {
  empfaengerEmail: string;
  empfaengerName: string;
  betreff: string;
  text: string;
}

/**
 * F5.8 Fix: Versendet eine Mahnung-/Erinnerungs-Mail via SMTP.
 * Vorher hat cron/erinnerungen die KI-generierten Mails NUR zurückgegeben
 * ohne sie tatsächlich zu versenden — User-Visible halb-gebrochener Workflow.
 */
export async function sendeMahnungEmail(options: MahnungEmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    logInfo(ROUTE, "Mahnung-Mail SMTP nicht konfiguriert — Versand übersprungen");
    return { success: false, error: "SMTP nicht konfiguriert" };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: { name: FIRMA, address: ABSENDER },
      to: { name: options.empfaengerName, address: options.empfaengerEmail },
      replyTo: ABSENDER,
      subject: options.betreff,
      headers: {
        "X-Mailer": "MR-Umbau-Bestellsystem/1.0",
        "X-Auto-Response-Suppress": "All",
      },
      text: options.text,
    });

    logInfo(ROUTE, "Mahnung-Mail Erinnerung gesendet", { an: options.empfaengerEmail });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    logError(ROUTE, "Mahnung-Mail Fehler", err);
    return { success: false, error: msg };
  }
}

/**
 * Erstellt einen sauberen, lesbaren PDF-Dateinamen.
 * z.B. "Rechnung_Raab_Karcher_Nr_8778719837.pdf"
 */
function erstelleSauberenDateinamen(haendlerName: string, bestellnummer: string | null): string {
  const haendler = haendlerName
    .replace(/[^a-zA-Z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 30);

  if (bestellnummer) {
    const nr = bestellnummer.replace(/[^a-zA-Z0-9-]/g, "").substring(0, 30);
    return `Rechnung_${haendler}_Nr_${nr}.pdf`;
  }

  return `Rechnung_${haendler}.pdf`;
}
