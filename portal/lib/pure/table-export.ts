/** Build a CSV string from headers and rows. Quotes fields containing commas, quotes, or newlines. */
export function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => {
    if (v.includes('"') || v.includes(",") || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\n");
}

/** Build a GitHub-flavored markdown table from headers and rows. */
export function toMarkdown(headers: string[], rows: string[][]): string {
  const pipe = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const sep = headers.map((h) => "-".repeat(Math.max(3, h.length)));
  const lines = [pipe(headers), pipe(sep)];
  for (const row of rows) lines.push(pipe(row));
  return lines.join("\n");
}

/** Trigger a file download in the browser. */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
