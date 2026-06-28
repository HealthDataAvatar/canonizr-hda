/** Portal telemetry — PostHog events for operationally important things that
 * must be watchable/alertable, not buried in logs. Mirrors the gateway emitter
 * (same EU host, same POSTHOG_API_KEY, graceful no-op when the key is absent).
 *
 * ponytail: deliberately tiny — one capture() helper, no event-class scaffolding.
 * Grow it only when a second caller needs shared event shapes.
 */

import { PostHog } from "posthog-node";
import { logger } from "@/lib/logger";

let _client: PostHog | null | undefined;

function client(): PostHog | null {
  if (_client === undefined) {
    const key = process.env.POSTHOG_API_KEY;
    _client = key ? new PostHog(key, { host: "https://eu.i.posthog.com" }) : null;
    if (!key) logger.warn("POSTHOG_API_KEY not set — portal telemetry disabled");
  }
  return _client;
}

/** Fire-and-forget a `canonizr:<event>` with arbitrary properties. */
export function emit(event: string, properties: Record<string, unknown> = {}): void {
  const c = client();
  if (!c) return;
  // distinctId is required by PostHog; these are system events, not per-user.
  c.capture({ distinctId: "portal-system", event: `canonizr:${event}`, properties });
}
