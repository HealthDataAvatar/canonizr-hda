"""MIME type classification — single source of truth for supported formats."""

# Formats any LLM can read directly — no conversion needed
PASSTHROUGH_TYPES = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/x-python",
    "text/x-java",
    "text/x-c",
    "text/x-script.python",
    "application/json",
    "application/xml",
    "text/xml",
    "image/svg+xml",
}

# Formats MarkItDown handles natively
MARKITDOWN_TYPES = {
    "text/html",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/epub+zip",  # .epub
    "message/rfc822",  # .eml
    "application/vnd.ms-outlook",  # .msg
}

# Formats that need LibreOffice (via Gotenberg) to convert to PDF first
LIBREOFFICE_TYPES = {
    "application/msword",  # .doc
    "application/rtf",  # .rtf
    "text/rtf",  # .rtf (alternate MIME)
    "application/vnd.ms-powerpoint",  # .ppt
    "application/vnd.ms-excel",  # .xls
    "application/vnd.oasis.opendocument.text",  # .odt
    "application/vnd.oasis.opendocument.presentation",  # .odp
    "application/vnd.oasis.opendocument.spreadsheet",  # .ods
    "application/vnd.apple.pages",  # .pages
    "application/vnd.apple.numbers",  # .numbers
    "application/vnd.apple.keynote",  # .key
}

# Archive formats (rejected at submission)
ARCHIVE_TYPES = {
    "application/zip",
    "application/x-zip-compressed",
    "application/gzip",
    "application/x-gzip",
    "application/x-tar",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/x-bzip2",
    "application/x-xz",
    "application/zstd",
}

KNOWN_MIME_TYPES = PASSTHROUGH_TYPES | MARKITDOWN_TYPES | LIBREOFFICE_TYPES | {"application/pdf"}
IMAGE_PREFIX = "image/"

# Formats that are themselves ZIP containers. libmagic reports these as a bare
# "application/zip" — indistinguishable from a real archive. These are the only
# types a client Content-Type is allowed to assert over a generic zip detection.
ZIP_CONTAINER_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/epub+zip",  # .epub
    "application/vnd.oasis.opendocument.text",  # .odt
    "application/vnd.oasis.opendocument.presentation",  # .odp
    "application/vnd.oasis.opendocument.spreadsheet",  # .ods
}


def is_known_mime_type(mime_type: str) -> bool:
    """Check if a MIME type is in our known set."""
    if mime_type in KNOWN_MIME_TYPES:
        return True
    return mime_type.startswith(IMAGE_PREFIX)


def is_archive_type(mime_type: str) -> bool:
    """Check if a MIME type is an archive format."""
    return mime_type in ARCHIVE_TYPES


def reconcile_mime(detected: str, client_mime: str) -> str:
    """Decide the authoritative MIME type from server-side detection + client hint.

    `detected` is what libmagic read from the bytes; it wins by default — a client
    cannot relabel a file magic positively identified (this is what stops an archive
    from masquerading as a PDF to skip the archive check). The client Content-Type is
    honoured only where magic is genuinely blind:

    - "application/zip": ambiguous between a real archive and a zip-container office
      doc, so trust the client only if it names a known ZIP_CONTAINER_TYPES format.
    - "application/octet-stream": magic couldn't identify it at all. A real archive
      would have been detected specifically, so trust any *known* client type here
      (keeps office docs and exotic images that magic misses working).
    """
    if detected == "application/zip":
        return client_mime if client_mime in ZIP_CONTAINER_TYPES else detected
    if detected == "application/octet-stream":
        return client_mime if is_known_mime_type(client_mime) else detected
    return detected
