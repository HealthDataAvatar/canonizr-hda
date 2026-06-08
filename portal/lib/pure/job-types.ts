/** Canonize job types for the portal UI.
 *
 * Submission facts are immutable. The current state is a discriminated union
 * so the UI can narrow with `switch (job.status)` and get full type safety.
 */

import type { ArtefactEntry } from "./artefacts";

/** What was submitted — always known, never changes. */
export interface CanonizeSubmission {
  id: string;
  keyId: string;
  filename: string;
  mimeType: string;
  inputBytes: number;
  pricePerUnit: number;
  submittedAt: string;
}

/** Latest state of a canonize job. */
export type CanonizeJobRow = CanonizeSubmission & (
  | { status: "processing" }
  | { status: "ok"; completedAt: string; expiresAt: string; artefacts: ArtefactEntry[] }
  | { status: "error"; completedAt: string; error: string }
  | { status: "expired"; completedAt: string; expiredAt: string }
);
