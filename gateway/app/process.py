"""Job dispatcher — routes jobs to the appropriate processor by type.

The worker calls dispatch_job; this module selects the right handler.
"""

from .context import Services
from .process_canonize import ProcessResult, process_canonize
from .protocols import Job, UserContext


async def dispatch_job(job: Job, user: UserContext, svc: Services) -> ProcessResult:
    """Dispatch a job to its processor."""
    # ponytail: only canonize exists — reinstate a match here when a second job type ships
    return await process_canonize(job, user, svc)
