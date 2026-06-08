import { JobTraceViewer } from "@/components/job-trace-viewer";
import { getDefaults } from "@/lib/data/tables/user-config";
import { getJobTrace } from "@/lib/data/tables/job-trace";

async function fetchTrace(jobId: string): Promise<string | null> {
  "use server";
  return getJobTrace(jobId);
}

export default function TracePage() {
  return (
    <div className="space-y-6">
      <h1>Job Trace</h1>
      <JobTraceViewer
        pricePerUnit={getDefaults().pricePerUnit}
        onFetchTrace={fetchTrace}
      />
    </div>
  );
}
