import type { ReactNode } from "react";

/** Page section with consistent max-width and padding. */
export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto max-w-5xl px-6 py-16 ${className}`}>
      {children}
    </section>
  );
}

/** Fluid section heading (h2). */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-semibold tracking-tight"
      style={{ fontSize: "clamp(1.25rem, 0.9rem + 1vw, 1.5rem)" }}
    >
      {children}
    </h2>
  );
}

/** Primary CTA button (accent background). */
export function ButtonPrimary({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </a>
  );
}

/** Secondary button (bordered). */
export function ButtonSecondary({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="rounded-md border px-4 py-2 text-xs font-medium text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </a>
  );
}
