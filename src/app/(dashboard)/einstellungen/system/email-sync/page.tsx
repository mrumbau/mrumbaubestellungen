import dynamicImport from "next/dynamic";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// 22.05.2026 (Perf Stufe 4 / Item 5) — Bundle-Split für 1192-LOC-Mega-Component.
const EmailSyncClient = dynamicImport(
  () => import("./email-sync-client").then((m) => m.EmailSyncClient),
);

export default async function EmailSyncPage() {
  // Role-gate is handled in /einstellungen/system/layout.tsx (admin-only)
  const supabase = await createServerSupabaseClient();
  const { data: folders } = await supabase
    .from("mail_sync_folders")
    .select("*")
    .order("folder_path", { ascending: true });

  return <EmailSyncClient initialFolders={folders ?? []} />;
}
