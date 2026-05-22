import type { Metadata, Viewport } from "next";
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
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MR Umbau – Bestellmanagement",
  description: "Digitales Bestellmanagement für MR Umbau GmbH",
  applicationName: "MR Umbau",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MR Umbau",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#570006",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${dmSans.variable} ${barlow.variable} ${mono.variable}`}>
      <head>
        {/* 22.05.2026 (Perf Stufe 4 / Item 1) — Supabase-Origin preconnect.
            Browser baut TLS-Handshake + DNS schon vor der ersten DB-Query auf,
            spart ~50-100ms beim ersten Supabase-Request pro Session. */}
        <link rel="preconnect" href="https://fxeobohsgzvymgbnxbdc.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fxeobohsgzvymgbnxbdc.supabase.co" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
