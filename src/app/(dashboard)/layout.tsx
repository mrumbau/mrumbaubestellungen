import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();

  if (!profil) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen bg-canvas">
        <Sidebar profil={profil} />
        <main className="flex-1 overflow-auto p-4 pt-16 md:p-8 md:pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
