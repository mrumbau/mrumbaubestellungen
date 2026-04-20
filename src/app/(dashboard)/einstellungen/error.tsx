"use client";

import { Button } from "@/components/ui/button";
import { IconAlertCircle } from "@/components/ui/icons";

export default function EinstellungenError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error mb-4 [&_svg]:h-6 [&_svg]:w-6">
        <IconAlertCircle />
      </div>
      <h2 className="font-headline text-[17px] tracking-tight text-foreground mb-1">
        Einstellungen konnten nicht geladen werden
      </h2>
      <p className="max-w-sm text-[13px] leading-relaxed text-foreground-muted mb-6">
        Beim Laden der Einstellungen ist ein Fehler aufgetreten. Bitte versuche es erneut.
      </p>
      <Button onClick={reset} size="lg">
        Neu laden
      </Button>
    </div>
  );
}
