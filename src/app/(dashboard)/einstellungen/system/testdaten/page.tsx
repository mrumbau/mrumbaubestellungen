import { createServerSupabaseClient } from "@/lib/supabase-server";
import { TestdatenClient } from "./testdaten-client";

export const dynamic = "force-dynamic";

export default async function TestdatenPage() {
  // Role-gate handled in parent /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();
  const { data: testCheck } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%")
    .limit(1);

  return <TestdatenClient initialHatTestdaten={!!testCheck && testCheck.length > 0} />;
}
