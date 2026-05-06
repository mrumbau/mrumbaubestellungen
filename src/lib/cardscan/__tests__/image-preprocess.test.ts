import { describe, it, expect } from "vitest";
import {
  parseBase64Image,
  validateImageSize,
  prepareImageForOcr,
} from "../image-preprocess";

describe("parseBase64Image", () => {
  it("erkennt JPEG aus Magic-Bytes", () => {
    const { mimeType, base64 } = parseBase64Image("/9j/4AAQSkZJRg==");
    expect(mimeType).toBe("image/jpeg");
    expect(base64).toBe("/9j/4AAQSkZJRg==");
  });

  it("erkennt PNG aus Magic-Bytes", () => {
    const { mimeType } = parseBase64Image("iVBORw0KGgoAAAANSUhEUgAA");
    expect(mimeType).toBe("image/png");
  });

  it("erkennt WebP aus Magic-Bytes", () => {
    const { mimeType } = parseBase64Image("UklGRhwBAABXRUJQ");
    expect(mimeType).toBe("image/webp");
  });

  it("parst Data-URL (jpeg)", () => {
    const { mimeType, base64 } = parseBase64Image(
      "data:image/jpeg;base64,/9j/4AAQ"
    );
    expect(mimeType).toBe("image/jpeg");
    expect(base64).toBe("/9j/4AAQ");
  });

  it("parst Data-URL (png)", () => {
    const { mimeType, base64 } = parseBase64Image(
      "data:image/png;base64,iVBORw=="
    );
    expect(mimeType).toBe("image/png");
    expect(base64).toBe("iVBORw==");
  });

  it("wirft bei kaputter Data-URL", () => {
    expect(() => parseBase64Image("data:nonsense")).toThrow();
  });

  it("Fallback auf jpeg bei unbekanntem Header", () => {
    const { mimeType } = parseBase64Image("ZZZZZZZZ");
    expect(mimeType).toBe("image/jpeg");
  });
});

describe("validateImageSize", () => {
  it("akzeptiert Größe unter Limit", () => {
    // 10 MB Limit, Base64 von 1 KB Daten = 1334 chars → 1 KB raw
    const base64 = "A".repeat(1334);
    const result = validateImageSize(base64, 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
    expect(result.sizeBytes).toBeLessThanOrEqual(1024);
  });

  it("lehnt Größe über Limit ab", () => {
    // 15 MB Base64 ≈ 11 MB raw, gegen 10 MB Limit
    const base64 = "A".repeat(15 * 1024 * 1024);
    const result = validateImageSize(base64, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(10 * 1024 * 1024);
  });

  it("rechnet Bytes korrekt aus Base64-Länge", () => {
    // Base64 mit 1000 chars → ~750 bytes raw
    const base64 = "A".repeat(1000);
    const { sizeBytes } = validateImageSize(base64, 100_000);
    expect(sizeBytes).toBe(750);
  });
});

describe("prepareImageForOcr", () => {
  it("gibt base64 + mimeType pass-through zurück", () => {
    const result = prepareImageForOcr("/9j/4AAQ", "image/jpeg");
    expect(result.base64).toBe("/9j/4AAQ");
    expect(result.mimeType).toBe("image/jpeg");
  });
});
