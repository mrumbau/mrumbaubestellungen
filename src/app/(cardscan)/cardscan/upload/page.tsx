"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * Client-seitige Bildkompression via Canvas.
 * Reduziert auf max 1920px lange Seite, JPEG Q85.
 */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const maxDim = Math.max(width, height);

      if (maxDim > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / maxDim;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas nicht verfügbar"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Kompression fehlgeschlagen"));
            return;
          }
          resolve(new File([blob], "capture.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden"));
    };

    img.src = url;
  });
}

/**
 * Konvertiert HEIC/HEIF zu JPEG via heic2any (lazy loaded).
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: JPEG_QUALITY,
  });

  const result = Array.isArray(blob) ? blob[0] : blob;
  return new File([result], "capture.jpg", { type: "image/jpeg" });
}

export default function CardScanUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setProcessing(null);

    // Typ-Check
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`Dateityp ${file.type || "unbekannt"} nicht unterstützt. Erlaubt: JPEG, PNG, WebP, HEIC.`);
      return;
    }

    // Größen-Check (vor Konvertierung)
    if (file.size > MAX_FILE_SIZE * 2) {
      setError("Datei zu groß (maximal 20 MB vor Kompression).");
      return;
    }

    let processedFile = file;

    try {
      // HEIC → JPEG Konvertierung
      if (file.type === "image/heic" || file.type === "image/heif") {
        setProcessing("Konvertiere HEIC → JPEG…");
        processedFile = await convertHeicToJpeg(file);
      }

      // Kompression
      setProcessing("Komprimiere Bild…");
      processedFile = await compressImage(processedFile);

      // Größen-Check nach Kompression
      if (processedFile.size > MAX_FILE_SIZE) {
        setError("Bild nach Kompression noch zu groß. Bitte ein kleineres Bild verwenden.");
        return;
      }

      setSelectedFile(processedFile);
      setProcessing(null);

      // Vorschau
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(processedFile);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Fehler bei der Bildverarbeitung"
      );
      setProcessing(null);
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("source_type", "image");

      const res = await fetch("/api/cardscan/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Extraktion fehlgeschlagen.");
        return;
      }

      router.push(`/cardscan/review/${data.capture_id}`);
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  function handleRemove() {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-2">
        Foto hochladen
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Visitenkarte, Briefkopf oder Dokument als Foto hochladen.
        HEIC-Bilder (iPhone) werden automatisch konvertiert.
      </p>

      {/* Datei-Auswahl */}
      {!selectedFile && (
        <div className="space-y-3">
          {/* Kamera-Button (öffnet native Kamera-App) */}
          <label className="card card-hover p-6 flex flex-col items-center gap-3 cursor-pointer block text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--mr-red)]/5 flex items-center justify-center">
              <svg className="w-7 h-7 text-[var(--mr-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Foto aufnehmen</p>
              <p className="text-xs text-[var(--text-tertiary)]">Öffnet die Kamera</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          {/* Galerie/Datei-Button */}
          <label className="card card-hover p-6 flex flex-col items-center gap-3 cursor-pointer block text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-input)] flex items-center justify-center">
              <svg className="w-7 h-7 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Aus Galerie / Dateien</p>
              <p className="text-xs text-[var(--text-tertiary)]">JPEG, PNG, WebP, HEIC</p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Verarbeitungs-Status */}
      {processing && (
        <div className="card p-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="spinner w-5 h-5" />
          {processing}
        </div>
      )}

      {/* Vorschau */}
      {preview && selectedFile && (
        <div className="space-y-4">
          <div className="card p-2 overflow-hidden">
            <img
              src={preview}
              alt="Vorschau"
              className="w-full rounded-[var(--radius-md)] object-contain max-h-80"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
            <span>
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
            </span>
            <button
              onClick={handleRemove}
              className="text-red-600 hover:text-red-700 font-medium"
            >
              Entfernen
            </button>
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Aktionen */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => router.push("/cardscan")}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors"
          disabled={loading}
        >
          Abbrechen
        </button>
        <button
          onClick={handleUpload}
          disabled={loading || !selectedFile}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="spinner w-4 h-4" />
              Analysiere…
            </>
          ) : (
            "Analysieren"
          )}
        </button>
      </div>
    </div>
  );
}
