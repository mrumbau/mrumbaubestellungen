import type { Metadata } from "next";
import { DM_Sans, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="de" className={`${dmSans.variable} ${barlow.variable} ${mono.variable}`}>
      <body className={`min-h-screen ${dmSans.className}`}>{children}</body>
    </html>
  );
}
