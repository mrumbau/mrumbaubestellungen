"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Input, Button, Alert, useToast } from "@/components/ui";

export function PasswortAendern() {
  const { toast } = useToast();
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [bestaetigung, setBestaetigung] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live-Validierung — erst melden, wenn der User im "bestaetigung"-Feld getippt hat,
  // damit wir ihn nicht mitten im Tippen des ersten Feldes anmeckern.
  const mismatch =
    bestaetigung.length > 0 && neuesPasswort !== bestaetigung
      ? "Passwörter stimmen nicht überein."
      : null;
  const lengthError =
    neuesPasswort.length > 0 && neuesPasswort.length < 8
      ? "Mindestens 8 Zeichen."
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (neuesPasswort.length < 8) {
      setSubmitError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (neuesPasswort !== bestaetigung) {
      setSubmitError("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: neuesPasswort });

      if (error) {
        setSubmitError(error.message);
      } else {
        toast.success("Passwort erfolgreich geändert.");
        setNeuesPasswort("");
        setBestaetigung("");
      }
    } catch {
      setSubmitError("Ein Fehler ist aufgetreten.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-headline text-[15px] tracking-tight text-foreground mb-1">
        Passwort ändern
      </h2>
      <p className="text-[13px] text-foreground-muted mb-5">
        Geben Sie ein neues Passwort ein (mindestens 8 Zeichen).
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <Input
          id="neues-passwort"
          type="password"
          label="Neues Passwort"
          value={neuesPasswort}
          onChange={(e) => setNeuesPasswort(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={lengthError}
        />

        <Input
          id="bestaetigung"
          type="password"
          label="Passwort bestätigen"
          value={bestaetigung}
          onChange={(e) => setBestaetigung(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={mismatch}
        />

        {submitError && <Alert tone="error">{submitError}</Alert>}

        <Button type="submit" loading={loading} disabled={!!lengthError || !!mismatch}>
          Passwort ändern
        </Button>
      </form>
    </div>
  );
}
