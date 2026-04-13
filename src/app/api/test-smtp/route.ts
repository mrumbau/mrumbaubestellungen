import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Temporärer Debug-Endpunkt — nach erfolgreichem Test löschen!
export async function GET(request: NextRequest) {
  const results: string[] = [];

  // 1. Env-Vars prüfen
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  results.push(`SMTP_USER: ${user ? user : "NICHT GESETZT"}`);
  results.push(`SMTP_PASSWORD: ${pass ? "***gesetzt*** (" + pass.length + " Zeichen)" : "NICHT GESETZT"}`);

  if (!user || !pass) {
    return NextResponse.json({ ergebnis: "FEHLER", details: results });
  }

  // 2. SMTP-Verbindung testen
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user, pass },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });

    results.push("Transporter erstellt, teste Verbindung...");

    await transporter.verify();
    results.push("SMTP VERIFY: OK — Verbindung erfolgreich!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push(`SMTP VERIFY FEHLER: ${msg}`);
    return NextResponse.json({ ergebnis: "SMTP_FEHLER", details: results });
  }

  // 3. Test-Mail senden
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user, pass },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });

    const info = await transporter.sendMail({
      from: { name: "MR Umbau GmbH", address: "bu@mrumbau.de" },
      to: "3878e32b-99b1-49ea-a278-0ee7623039a6@uploadmail.datev.de",
      replyTo: "bu@mrumbau.de",
      subject: "SMTP Test - MR Umbau Bestellsystem",
      text: "Dies ist eine Testnachricht vom MR Umbau Bestellsystem.\n\nWenn diese E-Mail ankommt, funktioniert der DATEV-Belegversand.",
    });

    results.push(`E-MAIL GESENDET: ${info.messageId}`);
    results.push(`Server-Antwort: ${info.response}`);
    return NextResponse.json({ ergebnis: "OK", details: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push(`SENDE-FEHLER: ${msg}`);
    return NextResponse.json({ ergebnis: "SENDE_FEHLER", details: results });
  }
}
