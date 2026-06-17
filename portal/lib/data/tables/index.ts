/** Barrel re-export for table helpers. Types come from table-interface.ts. */

export { getCurrentConfig, appendConfig } from "./user-config";
export { getCurrentPermissions, appendPermissions, setUserBlocked } from "./user-permissions";
export { listJobsForUser } from "./jobs";
export { getJobTrace } from "./job-trace";
export { getUser } from "./users";

export type { UserConfigRecord, UserPermissionsRecord, JobRecord, JobPage, UserRecord } from "@/lib/data/table-interface";
