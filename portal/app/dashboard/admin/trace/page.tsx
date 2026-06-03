import { JobTraceViewer } from "@/components/job-trace-viewer";
import { getDefaults } from "@/lib/data/tables/user-config";

export default function TracePage() {
  return (
    <div className="space-y-6">
      <h1>Job Trace</h1>
      <JobTraceViewer pricePerUnit={getDefaults().pricePerUnit} />
    </div>
  );
}
