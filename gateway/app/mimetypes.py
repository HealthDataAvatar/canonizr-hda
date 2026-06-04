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


def is_known_mime_type(mime_type: str) -> bool:
    """Check if a MIME type is in our known set."""
    if mime_type in KNOWN_MIME_TYPES:
        return True
    return mime_type.startswith(IMAGE_PREFIX)


def is_archive_type(mime_type: str) -> bool:
    """Check if a MIME type is an archive format."""
    return mime_type in ARCHIVE_TYPES
