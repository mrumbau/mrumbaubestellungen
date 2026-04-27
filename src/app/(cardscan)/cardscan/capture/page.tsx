"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

type CameraState = "requesting" | "active" | "denied" | "unsupported" | "captured";

export default function CardScanCapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("requesting");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startingRef = useRef(false);

  const startCamera = useCallback(async () => {
    // Guard: verhindert parallele getUserMedia-Calls
    if (startingRef.current) return;
    startingRef.current = true;

    setCameraState("requesting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      startingRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      // Video-Element ist immer im DOM – srcObject direkt setzen
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Auf iOS muss play() nach srcObject kommen und playsInline gesetzt sein
        try {
          await video.play();
        } catch {
          // play() kann auf iOS fehlschlagen wenn User noch nicht interagiert hat
        }
      }

      // Warten bis das Video tatsächlich Frames liefert
      // (loadedmetadata Event wird im JSX via onLoadedMetadata gehandelt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("denied")) {
        setCameraState("denied");
      } else {
        setCameraState("unsupported");
      }
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Video liefert Frames → Kamera ist aktiv
  function handleVideoReady() {
    const video = videoRef.current;
    if (video && video.videoWidth > 0) {
      setCameraState("active");
    }
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let w = video.videoWidth;
    let h = video.videoHeight;

    const maxDim = Math.max(w, h);
    if (maxDim > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / maxDim;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    if (navigator.vibrate) navigator.vibrate(50);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    setCapturedImage(dataUrl);

    canvas.toBlob(
      (blob) => { if (blob) setCapturedBlob(blob); },
      "image/jpeg",
      JPEG_QUALITY
    );

    setCameraState("captured");
    stopCamera();
  }

  function handleRetake() {
    setCapturedImage(null);
    setCapturedBlob(null);
    setError(null);
    startCamera();
  }

  async function handleAnalyze() {
    if (!capturedBlob) return;
    setLoading(true);
    setError(null);

    try {
      const file = new File([capturedBlob], "capture.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source_type", "image");

      const res = await fetch("/api/cardscan/extract", { method: "POST", body: formData });

      const raw = await res.text();
      let data: { error?: string; capture_id?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Antwort ist kein JSON (z.B. HTML-Fehlerseite vom Hosting)
      }

      if (!res.ok) {
        setError(data.error || `Server-Fehler (${res.status}).`);
        return;
      }

      if (!data.capture_id) {
        setError("Unerwartete Antwort vom Server.");
        return;
      }

      router.push(`/cardscan/review/${data.capture_id}`);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }

  function handleFallbackCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();

    const reader = new FileReader();
    reader.onload = (ev) => setCapturedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    setCapturedBlob(file);
    setCameraState("captured");
  }

  // ─── Kamera nicht verfügbar ───────────────────────────────────────

  if (cameraState === "unsupported") {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="font-headline text-xl text-[var(--text-primary)] mb-2">Kamera nicht verfügbar</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Dein Browser unterstützt keinen Kamera-Zugriff oder die Seite wird nicht über HTTPS aufgerufen.</p>
        <label className="inline-block py-3.5 px-6 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium cursor-pointer min-h-[44px]">
          Foto aus Galerie wählen
          <input type="file" accept="image/*" capture="environment" onChange={handleFallbackCapture} className="hidden" />
        </label>
        <button onClick={() => router.push("/cardscan/upload")} className="block mx-auto mt-4 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] min-h-[44px]">
          Oder zum Datei-Upload →
        </button>
      </div>
    );
  }

  if (cameraState === "denied") {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="font-headline text-xl text-[var(--text-primary)] mb-2">Kamera-Zugriff verweigert</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Bitte erlaube den Kamera-Zugriff in deinen Browser-Einstellungen und lade die Seite neu.</p>
        <button onClick={() => startCamera()} className="py-3.5 px-6 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium min-h-[44px]">
          Erneut versuchen
        </button>
        <button onClick={() => router.push("/cardscan/upload")} className="block mx-auto mt-4 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] min-h-[44px]">
          Zum Datei-Upload →
        </button>
      </div>
    );
  }

  // ─── Kamera / Capture ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black z-40 flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* Video-Feed – IMMER im DOM, nur visuell versteckt wenn captured */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleVideoReady}
          onPlaying={handleVideoReady}
          className={`w-full h-full object-cover ${cameraState === "captured" ? "hidden" : ""}`}
        />

        {/* Aufgenommenes Bild */}
        {cameraState === "captured" && capturedImage && (
          <img src={capturedImage} alt="Aufgenommenes Foto" className="w-full h-full object-contain bg-black" />
        )}

        {/* Loading Overlay wenn Kamera noch nicht bereit */}
        {cameraState === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="spinner w-8 h-8 mx-auto border-white/30 border-t-white" />
              <p className="text-white/50 text-sm mt-4">Kamera wird gestartet…</p>
            </div>
          </div>
        )}

        {/* Scan-Rahmen (nur wenn aktiv) */}
        {cameraState === "active" && (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[85%] max-w-sm aspect-[1.6/1] border-2 border-white/40 rounded-xl relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
              </div>
            </div>
            <div className="absolute top-4 left-0 right-0 text-center safe-area-top">
              <span className="text-white/80 text-sm bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm">
                Visitenkarte im Rahmen positionieren
              </span>
            </div>
          </>
        )}
      </div>

      {/* Fehler */}
      {error && (
        <div className="px-4 py-2 bg-red-600 text-white text-sm text-center">{error}</div>
      )}

      {/* Untere Leiste */}
      <div className="bg-black px-4 py-6 safe-area-bottom">
        {(cameraState === "active" || cameraState === "requesting") && (
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={() => { stopCamera(); router.push("/cardscan"); }}
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center min-h-[44px]"
              aria-label="Kamera schließen"
            >
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <button
              onClick={handleCapture}
              disabled={cameraState !== "active"}
              className="w-[72px] h-[72px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
              aria-label="Foto aufnehmen"
            >
              <div className="w-[62px] h-[62px] rounded-full border-[3px] border-black/10" />
            </button>

            <label className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center cursor-pointer min-h-[44px]" aria-label="Foto aus Galerie wählen">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              <input type="file" accept="image/*" onChange={handleFallbackCapture} className="hidden" />
            </label>
          </div>
        )}

        {cameraState === "captured" && (
          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              disabled={loading}
              className="flex-1 py-3.5 px-4 rounded-xl bg-white/10 text-white text-sm font-medium min-h-[48px] active:scale-[0.98] transition-transform"
            >
              Nochmal
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="flex-1 py-3.5 px-4 rounded-xl bg-white text-black text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition-transform"
            >
              {loading ? (
                <>
                  <span className="spinner w-4 h-4 border-black/20 border-t-black" />
                  Analysiere…
                </>
              ) : (
                "Analysieren"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
