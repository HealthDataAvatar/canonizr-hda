import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Shared test data — realistic formats matching production
// ---------------------------------------------------------------------------

export const TEST_KEY_VALUES = {
  key1: "a3f2c8d1e5b9f0a4c7d2e6b3f8a1c5d9",
  key2: "9c1e7b4da2f6c8d0e3b5f9a1c4d7e2b6",
  key3: "7b4df2a8c1e5d9b3f6a0c4d8e2b7f1a5",
} as const;

export const TEST_KEY_NAMES = {
  crane: "agent-bold-crane",
  raven: "agent-quiet-raven",
  otter: "agent-swift-otter",
} as const;

export const TEST_EMAILS = {
  short: "user@example.com",
  long: "a]very-long-username-that-might-overflow-the-ui@subdomain.example.co.uk",
} as const;

export const TEST_JOB_IDS = {
  normal: "V1StGXR8_Z5jHsqz",
  recent: "Xk9mLp2Q_wR4tYnB",
} as const;

/**
 * Labelled grid for showing multiple component variants in a single story.
 *
 * Usage:
 *   <Showcase items={[
 *     { label: "Default", children: <Component /> },
 *     { label: "Loading", children: <Component loading /> },
 *   ]} />
 */
export function Showcase({
  items,
  gap = "space-y-8",
  maxWidth,
}: {
  items: { label: string; children: ReactNode }[];
  gap?: string;
  maxWidth?: string;
}) {
  return (
    <div className={`${gap} ${maxWidth ?? ""}`}>
      {items.map(({ label, children }) => (
        <div key={label}>
          <p className="text-xs background-red text-muted-foreground mb-2 border-b-1 ">{label}</p>
          {children}
        </div>
      ))}
    </div>
  );
}
