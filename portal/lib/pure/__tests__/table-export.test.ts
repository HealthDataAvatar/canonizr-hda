import { describe, it, expect } from "vitest";
import { toCSV, toMarkdown } from "@/lib/pure/table-export";

describe("toCSV", () => {
  it("builds a CSV string", () => {
    const result = toCSV(["Name", "Size"], [["doc.pdf", "100 KB"], ["img.png", "200 KB"]]);
    expect(result).toBe("Name,Size\ndoc.pdf,100 KB\nimg.png,200 KB");
  });

  it("quotes fields with commas", () => {
    const result = toCSV(["Name"], [["hello, world"]]);
    expect(result).toBe('Name\n"hello, world"');
  });

  it("escapes double quotes", () => {
    const result = toCSV(["Name"], [['say "hi"']]);
    expect(result).toBe('Name\n"say ""hi"""');
  });

  it("handles empty rows", () => {
    expect(toCSV(["A", "B"], [])).toBe("A,B");
  });
});

describe("toMarkdown", () => {
  it("builds a markdown table", () => {
    const result = toMarkdown(["Name", "Size"], [["doc.pdf", "100 KB"]]);
    expect(result).toBe(
      "| Name | Size |\n| ---- | ---- |\n| doc.pdf | 100 KB |",
    );
  });

  it("uses minimum separator width of 3", () => {
    const result = toMarkdown(["A"], [["x"]]);
    expect(result).toBe("| A |\n| --- |\n| x |");
  });

  it("handles empty rows", () => {
    const result = toMarkdown(["A"], []);
    expect(result).toBe("| A |\n| --- |");
  });
});
