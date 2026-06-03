import { JobTraceViewer } from "@/components/job-trace-viewer";

export default function TracePage() {
  return (
    <div className="space-y-6">
      <h1>Job Trace</h1>
      <JobTraceViewer />
    </div>
  );
}
