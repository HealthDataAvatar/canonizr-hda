export const formats = [
  { format: "PDF", extensions: [".pdf"] },
  { format: "Microsoft Office (modern)", extensions: [".docx", ".pptx", ".xlsx",] },
  { format: "Microsoft Office (legacy)", extensions: [".doc", ".ppt", ".xls",] },
  { format: "EPUB", extensions: [".epub"] },
  { format: "Email", extensions: [".eml", ".msg"] },
  { format: "Images", extensions: [".png", ".jpg", ".webp", ".tiff", ".gif", ".bmp", ".heiv", ".avif", ".heic", ".svg", ".ico", ".pcx", ".tga", ".dds"] },
  { format: "Legacy Office", extensions: [".doc", ".ppt", ".rtf"] },
  { format: "OpenDocument", extensions: [".odt", ".odp", ".ods"] },
  { format: "Apple iWork", extensions: [".pages", ".numbers", ".key"] },
  { format: "And more!", extensions: [] },
] as const;
