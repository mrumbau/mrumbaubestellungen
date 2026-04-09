"use client";

import Link from "next/link";

export function BackLink({ href = "/cardscan", label = "Zurück" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors -ml-1 mb-5 py-1 active:opacity-60"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      {label}
    </Link>
  );
}
