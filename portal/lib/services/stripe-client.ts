/** The raw Stripe SDK client. Isolated so callers can mock this one seam. */
import Stripe from "stripe";

export function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
