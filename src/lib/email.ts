import nodemailer from "nodemailer";

// Microsoft 365 SMTP Transporter (info@mrumbau.de Shared Mailbox)
// Benötigt SMTP AUTH aktiviert im M365 Tenant + Send-As Berechtigung
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,     // z.B. mt@mrumbau.de (User mit Send-As auf info@)
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: true,
    },
  });
}

const DATEV_UPLOAD_EMAIL = "3878e32b-99b1-49ea-a278-0ee7623039a6@uploadmail.datev.de";

interface RechnungAnDatevOptions {
  bestellnummer: string | null;
  haendlerName: string;
  betrag: number | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

/**
 * Sendet eine Rechnungs-PDF an die DATEV Uploadmail-Adresse.
 * Wird automatisch bei Freigabe einer Rechnung aufgerufen.
 */
export async function sendeRechnungAnDatev(options: RechnungAnDatevOptions): Promise<{ success: boolean; error?: string }> {
  const { bestellnummer, haendlerName, betrag, pdfBuffer, pdfFilename } = options;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn("[DATEV-Mail] SMTP nicht konfiguriert — Versand übersprungen");
    return { success: false, error: "SMTP nicht konfiguriert" };
  }

  const betreffTeile = ["Rechnung"];
  if (haendlerName) betreffTeile.push(haendlerName);
  if (bestellnummer) betreffTeile.push(`#${bestellnummer}`);
  if (betrag != null) betreffTeile.push(`${betrag.toFixed(2)} EUR`);

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"MR Umbau Buchhaltung" <bu@mrumbau.de>`,
      to: DATEV_UPLOAD_EMAIL,
      subject: betreffTeile.join(" — "),
      text: `Automatisch übermittelte Rechnung aus dem MR Umbau Bestellsystem.\n\nHändler: ${haendlerName}\nBestellnummer: ${bestellnummer || "–"}\nBetrag: ${betrag != null ? betrag.toFixed(2) + " EUR" : "–"}`,
      attachments: [
        {
          filename: pdfFilename,
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
