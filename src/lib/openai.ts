import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DokumentAnalyse {
  typ: "bestellbestaetigung" | "lieferschein" | "rechnung";
  bestellnummer: string | null;
  haendler: string | null;
  datum: string | null;
  artikel: { name: string; menge: number; einzelpreis: number; gesamtpreis: number }[];
  gesamtbetrag: number | null;
  netto: number | null;
  mwst: number | null;
  faelligkeitsdatum: string | null;
  lieferdatum: string | null;
  iban: string | null;
  konfidenz: number;
}

export interface AbgleichErgebnis {
  status: "ok" | "abweichung";
  abweichungen: {
    feld: string;
    artikel?: string;
    erwartet: string | number;
    gefunden: string | number;
    dokument: string;
    schwere: "niedrig" | "mittel" | "hoch";
  }[];
  zusammenfassung: string;
}

// PDF/Bild analysieren mit GPT-4o
export async function analysiereDokument(
  base64: string,
  mimeType: string
): Promise<DokumentAnalyse> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Assistent der Geschäftsdokumente für eine deutsche Baufirma analysiert.
Analysiere das folgende Dokument und gib NUR ein JSON-Objekt zurück, kein Text davor oder danach.

Erkenne den Dokumenttyp: bestellbestaetigung, lieferschein, oder rechnung.

Gib folgende Struktur zurück:
{
  "typ": "rechnung",
  "bestellnummer": "#45231",
  "haendler": "Bauhaus GmbH",
  "datum": "2026-03-12",
  "artikel": [
    { "name": "Bosch Bohrmaschine", "menge": 2, "einzelpreis": 89.99, "gesamtpreis": 179.98 }
  ],
  "gesamtbetrag": 234.50,
  "netto": 197.06,
  "mwst": 37.44,
  "faelligkeitsdatum": "2026-03-26",
  "lieferdatum": null,
  "iban": "DE12 3456 7890 1234 5678 90",
  "konfidenz": 0.95
}

Falls ein Feld nicht erkennbar ist, setze null.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content || "{}";
  // JSON aus der Antwort extrahieren (falls in ```json...``` gewrappt)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

// KI-Abgleich zwischen den 3 Dokumenten
export async function fuehreAbgleichDurch(
  bestellbestaetigung: DokumentAnalyse | null,
  lieferschein: DokumentAnalyse | null,
  rechnung: DokumentAnalyse | null
): Promise<AbgleichErgebnis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du bist ein Prüfassistent für eine deutsche Baufirma.
Vergleiche die folgenden Dokumente einer Bestellung und prüfe ob alles übereinstimmt.

Gib NUR ein JSON-Objekt zurück:
{
  "status": "ok" | "abweichung",
  "abweichungen": [
    {
      "feld": "menge",
      "artikel": "Bosch Bohrmaschine",
      "erwartet": 2,
      "gefunden": 1,
      "dokument": "lieferschein",
      "schwere": "hoch"
    }
  ],
  "zusammenfassung": "Alles stimmt überein." | "Abweichung gefunden: ..."
}`,
      },
      {
        role: "user",
        content: `Bestellbestätigung: ${JSON.stringify(bestellbestaetigung)}
Lieferschein: ${JSON.stringify(lieferschein)}
Rechnung: ${JSON.stringify(rechnung)}`,
      },
    ],
    max_tokens: 2000,
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}
