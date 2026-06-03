import asyncio
import functools
from io import BytesIO

from markitdown import MarkItDown

from .context import Services
from .imageconv import extract_pages, is_multipage
from .response import ConvertResult
from .services.image_postprocess import IMAGE_RE, CaptionResult, caption_images, label_images
from .tracing import Service, Trace

markitdown = MarkItDown()

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
    "text/html",  # HTML → clean markdown
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


async def convert(
    file_bytes: bytes, mime_type: str, filename: str, deadline: float, trace: Trace, svc: Services
) -> ConvertResult:
    """Convert any supported file to markdown."""
    parent = trace.root

    # Passthrough — already LLM-readable
    if mime_type in PASSTHROUGH_TYPES:
        with parent.span(Service.PASSTHROUGH):
            pass
        return ConvertResult(
            markdown=file_bytes.decode("utf-8", errors="replace"),
            detected_type=mime_type,
            actions=["passthrough"],
        )

    # Images — describe via vision model
    if mime_type.startswith("image/"):
        if not svc.captioner.is_available():
            raise ServiceNotConfigured(
                "Image processing requires the captioning service. "
                "Set CAPTIONING_ENABLED=true in .env and ensure the captioning container is running."
            )
        if is_multipage(mime_type):
            with parent.span(Service.EXTRACT_PAGES) as ep_span:
                pages = extract_pages(file_bytes)
                ep_span.set(page_count=len(pages))

            results = []
            with parent.span(Service.CAPTIONING, service="openai/gpt-4o", page_count=len(pages)) as cap_span:
                for i, (p, mt) in enumerate(pages):
                    with cap_span.span(f"page[{i}]") as page_span:
                        r = await svc.captioner.describe_file(p, mt, deadline, page_span)
                    results.append(r)
                cap_span.set(
                    images_captioned=sum(r.images_captioned for r in results),
                    prompt_tokens=sum(r.captioning_prompt_tokens for r in results),
                    completion_tokens=sum(r.captioning_completion_tokens for r in results),
                )

            markdown = "\n\n---\n\n".join(r.markdown for r in results)
            return ConvertResult(
                markdown=markdown,
                detected_type=mime_type,
                actions=["captioning"],
                images_captioned=sum(r.images_captioned for r in results),
                captioning_prompt_tokens=sum(r.captioning_prompt_tokens for r in results),
                captioning_completion_tokens=sum(r.captioning_completion_tokens for r in results),
            )
        with parent.span(Service.CAPTIONING, service="openai/gpt-4o") as cap_span:
            result = await svc.captioner.describe_file(file_bytes, mime_type, deadline, cap_span)
            cap_span.set(
                images_captioned=result.images_captioned,
                prompt_tokens=result.captioning_prompt_tokens,
                completion_tokens=result.captioning_completion_tokens,
            )
        result.detected_type = mime_type
        return result

    # PDF — Docling for quality extraction, then caption images
    if mime_type == "application/pdf":
        with parent.span(Service.DOCLING) as docling_span:
            md_content, pictures = await svc.pdf_extractor.convert(file_bytes, mime_type, deadline, docling_span)

        actions = ["docling"]
        cap = CaptionResult(markdown=md_content)
        image_count = len(list(IMAGE_RE.finditer(md_content)))

        if image_count > 0:
            if svc.captioner.is_available():
                cap = await caption_images(md_content, pictures, deadline, parent, svc.captioner)
                actions.append("captioning")
            else:
                cap = label_images(md_content, pictures)
                actions.append("labelling")

        return ConvertResult(
            markdown=cap.markdown,
            detected_type=mime_type,
            actions=actions,
            images_captioned=cap.captioned,
            images_skipped=cap.skipped,
            images_errored=cap.errored,
            captioning_prompt_tokens=cap.prompt_tokens,
            captioning_completion_tokens=cap.completion_tokens,
        )

    # Office docs MarkItDown handles directly
    if mime_type in MARKITDOWN_TYPES:
        loop = asyncio.get_event_loop()
        with parent.span(Service.MARKITDOWN) as md_span:
            mit_result = await loop.run_in_executor(
                None,
                functools.partial(
                    markitdown.convert_stream, BytesIO(file_bytes), file_extension=_ext_from_filename(filename)
                ),
            )
            md_span.set(md_length=len(mit_result.text_content))
        return ConvertResult(
            markdown=mit_result.text_content,
            detected_type=mime_type,
            actions=["markitdown"],
        )

    # Legacy formats — Gotenberg converts to PDF, then Docling extracts
    if mime_type in LIBREOFFICE_TYPES:
        if not svc.office_converter.is_available():
            raise ServiceNotConfigured(f"This file type ({mime_type}) requires LibreOffice. Rerun setup to enable it.")
        with parent.span(Service.GOTENBERG) as lo_span:
            pdf_bytes, _ = await svc.office_converter.convert(file_bytes, mime_type, filename, deadline, lo_span)
        result = await convert(pdf_bytes, "application/pdf", filename, deadline, trace, svc)
        result.actions.insert(0, f"gotenberg ({mime_type} -> pdf)")
        result.detected_type = mime_type
        return result

    raise UnsupportedFormat(mime_type)


def _ext_from_filename(filename: str) -> str:
    """Extract file extension from filename."""
    if "." in filename:
        return "." + filename.rsplit(".", 1)[-1].lower()
    return ""


class UnsupportedFormat(Exception):
    def __init__(self, mime_type: str):
        self.mime_type = mime_type
        super().__init__(f"Unsupported file type: {mime_type}")


class ServiceNotConfigured(Exception):
    def __init__(self, message: str):
        super().__init__(message)
