"""Pipeline exception hierarchy."""


class UnsupportedFormat(Exception):
    def __init__(self, mime_type: str):
        self.mime_type = mime_type
        super().__init__(f"Unsupported file type: {mime_type}")


class ServiceNotConfigured(Exception):
    def __init__(self, message: str):
        super().__init__(message)


class MalformedInput(Exception):
    """User submitted bytes we can't decode (corrupt image, decompression bomb,
    etc.). The user's fault, not ours — maps to 400 / permanent, not 500."""

    def __init__(self, message: str):
        super().__init__(message)
