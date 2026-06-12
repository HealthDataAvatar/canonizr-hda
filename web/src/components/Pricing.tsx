import { PRICE_PER_100KB, FREE_TIER } from "../data/pricing";
import { Section, SectionHeading } from "./ui";

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading>Pricing</SectionHeading>

      <div className="mt-8 flex flex-wrap gap-12">
        <div>
          <p className="text-2xl font-semibold tracking-tight">
            {PRICE_PER_100KB}
            <span className="text-base font-normal text-muted">
              {" "}/ 100 KB
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">All formats, uniform pricing.</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight">
            {FREE_TIER}
          </p>
          <p className="mt-1 text-xs text-muted">No credit card required.</p>
        </div>
      </div>

      <ul className="mt-8 space-y-1.5 text-sm text-muted">
        <li>Billed per 100 KB of input.</li>
        <li>Failed jobs are automatically refunded.</li>
        <li>Optional per-key quotas for cost control.</li>
      </ul>
    </Section>
  );
}
