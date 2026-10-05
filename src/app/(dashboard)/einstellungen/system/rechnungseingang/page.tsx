import { redirect } from "next/navigation";

/** 03.10.2026 — Die Seite heisst jetzt "Eingang" und liegt in der Hauptnavigation. */
export default function RechnungseingangWeiterleitung() {
  redirect("/eingang");
}
