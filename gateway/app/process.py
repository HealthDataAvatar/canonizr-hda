"""Job dispatcher — routes jobs to the appropriate processor by type.

The worker calls dispatch_job; this module selects the right handler.
"""

from .context import Services
from .process_canonize import ProcessResult, process_canonize
from .protocols import Job, JobType, UserContext


async def dispatch_job(job: Job, user: UserContext, svc: Services) -> ProcessResult:
    """Dispatch a job to the appropriate processor."""
    match job.job_type:
        case JobType.CANONIZE:
            return await process_canonize(job, user, svc)
        case JobType.DESCRIBE:
            from .process_describe import process_describe

            return await process_describe(job, user, svc)
        case _:
            # Backward compat: jobs without a type default to canonize
            return await process_canonize(job, user, svc)


# Re-export for backward compatibility
process_job = dispatch_job
