import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

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
    <div className="flex h-screen bg-[#f5f4f2]">
      <Sidebar profil={profil} />
      <main className="flex-1 overflow-auto p-4 pt-16 md:p-8 md:pt-8">{children}</main>
    </div>
  );
}
