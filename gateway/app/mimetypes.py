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

# What libmagic returns when it can't pin down a *specific* format: generic text, an
# unidentified blob, a bare zip (it can't tell a real archive from an office doc on
# older DBs), or an empty file. In these cases we defer to the client's declared type
# (which carries the file extension), since that's the only signal that distinguishes
# text subtypes, archives, and empty files. Anything else means magic positively
# identified the format and wins.
_GENERIC_DETECTIONS = {
    "",
    "text/plain",
    "application/octet-stream",
    "application/zip",
    "application/x-empty",
    "inode/x-empty",
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
    """Decide the authoritative MIME type from magic's detection + the client's hint.

    magic wins when it positively identifies a format (pdf, docx, image/*, ...) — this
    is what stops a misnamed file (e.g. a real PDF sent as text/plain) from being routed
    to the wrong converter and silently garbled. When magic is inconclusive (generic
    text/binary/zip/empty), the client's declared Content-Type wins — that's where the
    file extension is the better signal: text subtypes, archives (rejected downstream by
    declared type), and empty files. Falls back to the detected value if the client
    sent no type.
    """
    if detected in _GENERIC_DETECTIONS:
        return client_mime or detected
    return detected
