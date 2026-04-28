import { createServerSupabaseClient } from "@/lib/supabase-server";
import { EmailSyncClient } from "./email-sync-client";

export const dynamic = "force-dynamic";

export default async function EmailSyncPage() {
  // Role-gate is handled in /einstellungen/system/layout.tsx (admin-only)
  const supabase = await createServerSupabaseClient();
  const { data: folders } = await supabase
    .from("mail_sync_folders")
    .select("*")
    .order("folder_path", { ascending: true });

  return <EmailSyncClient initialFolders={folders ?? []} />;
}
