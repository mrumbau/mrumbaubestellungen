/**
 * CSV export utility — Excel-kompatibel (UTF-8 BOM), deutsch-lokalisiert.
 *
 * Warum UTF-8 BOM? Ohne BOM interpretiert Excel UTF-8 CSV als Windows-1252
 * und zeigt Umlaute kaputt. `\ufeff` ganz vorne löst das.
 *
 * Beispiel:
 *   exportToCsv("bestellungen_20260420.csv", data, [
 *     { header: "Bestellnr", value: (b) => b.bestellnummer ?? "" },
 *     { header: "Händler", value: (b) => b.haendler_name ?? "" },
 *     { header: "Betrag", value: (b) => b.betrag, numeric: true },
 *   ]);
 */
export type CsvColumn<TRow> = {
  header: string;
  value: (row: TRow) => string | number | Date | null | undefined;
  /** If true, numeric values are formatted with comma as decimal separator (de-DE). */
  numeric?: boolean;
};

export function exportToCsv<TRow>(
  filename: string,
  rows: TRow[],
  columns: CsvColumn<TRow>[],
) {
  const sep = ";"; // de-DE convention — Excel on German Windows defaults to semicolon
  const esc = (v: string) => {
    // Quote if contains separator, quote, or newline
    if (/["\n\r;]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const formatValue = (col: CsvColumn<TRow>, row: TRow): string => {
    const raw = col.value(row);
    if (raw === null || raw === undefined) return "";
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (typeof raw === "number") {
      if (col.numeric) {
        return raw.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      return String(raw);
    }
    return String(raw);
  };

  const headerRow = columns.map((c) => esc(c.header)).join(sep);
  const bodyRows = rows.map((row) =>
    columns.map((c) => esc(formatValue(c, row))).join(sep),
  );

  const csv = "\ufeff" + [headerRow, ...bodyRows].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build a timestamped filename like `bestellungen_20260420_1130.csv`.
 */
export function csvFilename(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}_${stamp}.csv`;
}
