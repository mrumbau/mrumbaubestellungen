import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MR Umbau – Bestellmanagement",
  description: "Digitales Bestellmanagement für MR Umbau GmbH",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-[var(--background)]">{children}</body>
    </html>
  );
}
