"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Bestellungsart } from "@/lib/bestellung-utils";
import type { DuplikatResult, KatResult, ProjektStats } from "./types";

/**
 * use-bestelldetail — centralises all API handlers + cross-section state.
 *
 * The monolith had 30+ useState hooks scattered across one render function.
 * This hook groups them by domain (scan / ki / projekt / freigabe / verwerfen /
 * bestellungsart / mahnung-quit), exposes typed handlers, and keeps the
 * sub-components free of fetch boilerplate.
 */
export function useBestelldetail({
  bestellungId,
  initialBestellungsart,
  initialProjektId,
}: {
  bestellungId: string;
  initialBestellungsart: Bestellungsart | null;
  initialProjektId: string | null;
}) {
  const router = useRouter();

  // Shared loading/error banner
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Scan (document upload)
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  // KI tools
  const [kiZusammenfassung, setKiZusammenfassung] = useState<string | null>(null);
  const [kiLoading, setKiLoading] = useState(false);
  const [duplikatResult, setDuplikatResult] = useState<DuplikatResult | null>(null);
  const [duplikatLoading, setDuplikatLoading] = useState(false);
  const [katResult, setKatResult] = useState<KatResult | null>(null);
  const [katLoading, setKatLoading] = useState(false);

  // Projekt
  const [projektLoading, setProjektLoading] = useState(false);
  const [projektStats, setProjektStats] = useState<ProjektStats | null>(null);
  const [vorschlagLoading, setVorschlagLoading] = useState(false);

  // Freigabe
  const [showFreigabeDialog, setShowFreigabeDialog] = useState(false);
  const [freigabeError, setFreigabeError] = useState<string | null>(null);

  // Verwerfen
  const [showVerwerfenDialog, setShowVerwerfenDialog] = useState(false);
  const [verwerfenLoading, setVerwerfenLoading] = useState(false);

  // Bestellungsart
  const [bestellungsartLoading, setBestellungsartLoading] = useState(false);
  const [aktuelleArt, setAktuelleArt] = useState<Bestellungsart>(
    initialBestellungsart || "material",
  );

  // File inputs (shared across desktop + mobile)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Projekt-Stats on mount + whenever projekt_id changes
  useEffect(() => {
    if (!initialProjektId) {
      setProjektStats(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/projekte/${initialProjektId}/stats`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setProjektStats({
          gesamt_ausgaben: data.gesamt_ausgaben,
          budget: data.budget,
          budget_auslastung_prozent: data.budget_auslastung_prozent,
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setProjektStats(null);
      });
    return () => controller.abort();
  }, [initialProjektId]);

  // ─── Scan / Upload ──────────────────────────────────────

  const handleScan = useCallback(
    async (file: File, erwarteterTyp: string) => {
      if (file.size > 4 * 1024 * 1024) {
        setFileSizeError("Datei ist zu groß (max. 4 MB). Bitte eine kleinere Datei verwenden.");
        return;
      }
      setFileSizeError(null);
      setScanLoading(true);
      setScanError(null);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (!reader.result || typeof reader.result !== "string") {
            setScanError("Datei konnte nicht gelesen werden.");
            setScanLoading(false);
            return;
          }
          const base64 = reader.result.split(",")[1];
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bestellung_id: bestellungId,
              base64,
              mime_type: file.type,
              datei_name: file.name,
              erwarteter_typ: erwarteterTyp,
            }),
          });
          let data;
          try {
            data = await res.json();
          } catch {
            setScanError(`Server-Fehler (${res.status}). Bitte kleinere Datei versuchen.`);
            setScanLoading(false);
            return;
          }
          if (!res.ok) {
            setScanError(data.error || "Upload fehlgeschlagen");
          } else {
            router.refresh();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
          setScanError(`Upload fehlgeschlagen: ${msg}`);
        } finally {
          setScanLoading(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [bestellungId, router],
  );

  const handleZipDownload = useCallback(async () => {
    try {
      const res = await fetch(`/api/pdfs/zip?bestellung_id=${bestellungId}`);
      if (!res.ok) {
        let msg = "Download fehlgeschlagen";
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {
          /* ignore */
        }
        setActionError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] || "Dokumente.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Download fehlgeschlagen. Bitte erneut versuchen.");
    }
  }, [bestellungId]);

  // ─── KI Tools ───────────────────────────────────────────

  const handleKiZusammenfassung = useCallback(async () => {
    setKiLoading(true);
    try {
      const res = await fetch("/api/ki/bestellung-zusammenfassung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId }),
      });
      const data = await res.json();
      if (res.ok) {
        setKiZusammenfassung(data.zusammenfassung);
        setActionError(null);
      } else {
        setActionError("KI-Zusammenfassung fehlgeschlagen");
      }
    } catch {
      setActionError("Netzwerkfehler bei der KI-Zusammenfassung");
    } finally {
      setKiLoading(false);
    }
  }, [bestellungId]);

  const handleDuplikatCheck = useCallback(async () => {
    setDuplikatLoading(true);
    try {
      const res = await fetch("/api/ki/duplikat-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDuplikatResult(data);
        setActionError(null);
      } else {
        setActionError("Duplikat-Check fehlgeschlagen");
      }
    } catch {
      setActionError("Netzwerkfehler beim Duplikat-Check");
    } finally {
      setDuplikatLoading(false);
    }
  }, [bestellungId]);

  const handleKategorisierung = useCallback(async () => {
    setKatLoading(true);
    try {
      const res = await fetch("/api/ki/kategorisierung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId }),
      });
      const data = await res.json();
      if (res.ok) {
        setKatResult(data);
        setActionError(null);
      } else {
        setActionError("Kategorisierung fehlgeschlagen");
      }
    } catch {
      setActionError("Netzwerkfehler bei der Kategorisierung");
    } finally {
      setKatLoading(false);
    }
  }, [bestellungId]);

  // ─── Projekt ────────────────────────────────────────────

  const handleProjektZuordnen = useCallback(
    async (projektId: string | null) => {
      setProjektLoading(true);
      try {
        const res = await fetch(`/api/bestellungen/${bestellungId}/projekt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projekt_id: projektId }),
        });
        if (res.ok) {
          setActionError(null);
          router.refresh();
        } else {
          setActionError("Projekt-Zuordnung fehlgeschlagen");
        }
      } catch {
        setActionError("Netzwerkfehler bei der Projekt-Zuordnung");
      } finally {
        setProjektLoading(false);
      }
    },
    [bestellungId, router],
  );

  const handleVorschlagAktion = useCallback(
    async (
      aktion: "bestaetigen" | "ablehnen",
      korrektesProjektId?: string,
    ) => {
      setVorschlagLoading(true);
      try {
        const res = await fetch(`/api/bestellungen/${bestellungId}/projekt-bestaetigen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aktion,
            ...(korrektesProjektId ? { korrektes_projekt_id: korrektesProjektId } : {}),
          }),
        });
        if (res.ok) {
          setActionError(null);
          router.refresh();
        } else {
          setActionError("Projekt-Bestätigung fehlgeschlagen");
        }
      } catch {
        setActionError("Netzwerkfehler bei der Projekt-Bestätigung");
      } finally {
        setVorschlagLoading(false);
      }
    },
    [bestellungId, router],
  );

  // ─── Bestellungsart ─────────────────────────────────────

  const handleBestellungsartChange = useCallback(
    async (neueArt: Bestellungsart) => {
      if (neueArt === aktuelleArt) return;
      setBestellungsartLoading(true);
      try {
        const res = await fetch(`/api/bestellungen/${bestellungId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellungsart: neueArt }),
        });
        if (res.ok) {
          setAktuelleArt(neueArt);
          setActionError(null);
          router.refresh();
        } else {
          setActionError("Bestellungsart konnte nicht geändert werden");
        }
      } catch {
        setActionError("Netzwerkfehler beim Ändern der Bestellungsart");
      } finally {
        setBestellungsartLoading(false);
      }
    },
    [aktuelleArt, bestellungId, router],
  );

  // ─── Freigabe ───────────────────────────────────────────

  const handleFreigabe = useCallback(async () => {
    setShowFreigabeDialog(false);
    setFreigabeError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setFreigabeError(data.error || "Freigabe fehlgeschlagen");
      }
    } catch {
      setFreigabeError("Netzwerkfehler bei der Freigabe");
    } finally {
      setLoading(false);
    }
  }, [bestellungId, router]);

  // ─── Verwerfen ──────────────────────────────────────────

  const handleVerwerfen = useCallback(async () => {
    setVerwerfenLoading(true);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_id: bestellungId }),
      });
      if (res.ok) {
        router.push("/bestellungen");
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Bestellung konnte nicht verworfen werden");
      }
    } catch {
      setActionError("Netzwerkfehler beim Verwerfen");
    } finally {
      setVerwerfenLoading(false);
      setShowVerwerfenDialog(false);
    }
  }, [bestellungId, router]);

  // ─── Mahnung quittieren ─────────────────────────────────

  const handleMahnungQuittieren = useCallback(async () => {
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mahnung_am: null, mahnung_count: 0 }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setActionError("Mahnung konnte nicht quittiert werden. Bitte erneut versuchen.");
    } catch {
      setActionError("Netzwerkfehler beim Quittieren der Mahnung.");
    }
  }, [bestellungId, router]);

  // ─── Kommentar ──────────────────────────────────────────

  const handleKommentar = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim()) return false;
      setLoading(true);
      try {
        const res = await fetch("/api/kommentare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellung_id: bestellungId, text }),
        });
        if (res.ok) {
          router.refresh();
          return true;
        }
        setActionError("Kommentar konnte nicht gespeichert werden");
        return false;
      } catch {
        setActionError("Netzwerkfehler beim Speichern des Kommentars");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [bestellungId, router],
  );

  return {
    // Shared
    loading,
    actionError,
    setActionError,

    // Scan
    scanLoading,
    scanError,
    setScanError,
    fileSizeError,
    setFileSizeError,
    fileInputRef,
    cameraInputRef,
    handleScan,
    handleZipDownload,

    // KI Tools
    kiZusammenfassung,
    kiLoading,
    duplikatResult,
    duplikatLoading,
    katResult,
    katLoading,
    handleKiZusammenfassung,
    handleDuplikatCheck,
    handleKategorisierung,

    // Projekt
    projektLoading,
    projektStats,
    vorschlagLoading,
    handleProjektZuordnen,
    handleVorschlagAktion,

    // Bestellungsart
    bestellungsartLoading,
    aktuelleArt,
    handleBestellungsartChange,

    // Freigabe
    showFreigabeDialog,
    setShowFreigabeDialog,
    freigabeError,
    handleFreigabe,

    // Verwerfen
    showVerwerfenDialog,
    setShowVerwerfenDialog,
    verwerfenLoading,
    handleVerwerfen,

    // Mahnung
    handleMahnungQuittieren,

    // Kommentare
    handleKommentar,
  };
}
