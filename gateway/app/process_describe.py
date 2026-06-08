"""Worker processing for describe jobs — stub for future implementation."""

from .context import Services
from .process_canonize import ProcessResult
from .protocols import Job, JobResult, UserContext


async def process_describe(job: Job, user: UserContext, svc: Services) -> ProcessResult:
    """Process a describe job. Not yet implemented."""
    return ProcessResult(
        JobResult(job_id=job.job_id, status="error", detail="Describe jobs not yet implemented", status_code=501)
    )
