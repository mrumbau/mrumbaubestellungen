import nodemailer from "nodemailer";

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
    console.warn("[DATEV-Mail] SMTP nicht konfiguriert — Versand übersprungen");
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

    console.log(`[DATEV-Mail] Rechnung gesendet: ${haendlerName} ${bestellnummer || ""}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error(`[DATEV-Mail] Fehler: ${msg}`);
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
    console.warn("[Mahnung-Mail] SMTP nicht konfiguriert — Versand übersprungen");
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

    console.log(`[Mahnung-Mail] Erinnerung gesendet an ${options.empfaengerEmail}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error(`[Mahnung-Mail] Fehler: ${msg}`);
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
