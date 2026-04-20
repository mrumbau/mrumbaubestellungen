import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AboAnbieterClient, type AboAnbieter } from "./abo-anbieter-client";

export const dynamic = "force-dynamic";

export default async function AboAnbieterPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  // Fachliche Stammdaten-Pflege: Admin + Besteller dürfen, Buchhaltung nicht
  if (profil.rolle === "buchhaltung") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();
  const { data: abo } = await supabase
    .from("abo_anbieter")
    .select(
      "id, name, domain, email_absender, intervall, erwarteter_betrag, toleranz, naechste_rechnung, vertragsbeginn, vertragsende, kuendigungsfrist_tage, notizen, letzter_betrag, letzte_rechnung_am, created_at",
    )
    .order("name");

  // The DB column is `toleranz` in this project (not `toleranz_prozent`)
  // — normalize here so the client only knows the latter.
  const normalized: AboAnbieter[] = (abo || []).map((a) => {
    const raw = a as Record<string, unknown>;
    return {
      id: String(raw.id),
      name: String(raw.name),
      domain: String(raw.domain),
      email_absender: (raw.email_absender as string[]) || [],
      intervall: (raw.intervall as AboAnbieter["intervall"]) || "monatlich",
      erwarteter_betrag:
        raw.erwarteter_betrag != null ? Number(raw.erwarteter_betrag) : null,
      toleranz_prozent: raw.toleranz != null ? Number(raw.toleranz) : 10,
      naechste_rechnung: (raw.naechste_rechnung as string | null) ?? null,
      vertragsbeginn: (raw.vertragsbeginn as string | null) ?? null,
      vertragsende: (raw.vertragsende as string | null) ?? null,
      kuendigungsfrist_tage:
        raw.kuendigungsfrist_tage != null ? Number(raw.kuendigungsfrist_tage) : null,
      notizen: (raw.notizen as string | null) ?? null,
      letzter_betrag: raw.letzter_betrag != null ? Number(raw.letzter_betrag) : null,
      letzte_rechnung_am: (raw.letzte_rechnung_am as string | null) ?? null,
      created_at: String(raw.created_at),
    };
  });

  return <AboAnbieterClient initialListe={normalized} />;
}
