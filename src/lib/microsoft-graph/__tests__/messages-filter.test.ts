import { describe, it, expect } from "vitest";
import { graphFilterInternetMessageId } from "../messages";

describe("graphFilterInternetMessageId", () => {
  it("baut den OData-Filter mit der Kennung in Anfuehrungszeichen", () => {
    expect(graphFilterInternetMessageId("<abc@stark-deutschland.de>")).toBe(
      "internetMessageId eq '<abc@stark-deutschland.de>'",
    );
  });

  it("verdoppelt einfache Anfuehrungszeichen, damit der Filter nicht zerbricht", () => {
    expect(graphFilterInternetMessageId("<a'b@x.de>")).toBe("internetMessageId eq '<a''b@x.de>'");
  });
});
