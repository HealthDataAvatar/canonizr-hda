import { ButtonPrimary, ButtonSecondary } from "./ui";


export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-24 pb-16">
      <h1
        className="font-semibold tracking-tight"
        style={{ fontSize: "clamp(1.75rem, 1rem + 2.5vw, 2.75rem)" }}
      >
        Document Extraction API
      </h1>
      <p className="my-4 text-muted leading-relaxed">
        Send any document. Get clean, readable data back.
        Designed for humans and AI agents.
      </p>
      <div className="my-8 flex flex-wrap gap-4">
        <ButtonPrimary href="https://portal.canonizr.com">
          Get Started
        </ButtonPrimary>
        <ButtonSecondary href="https://api.canonizr.com/docs">
          Read the Docs
        </ButtonSecondary>
      </div>
      <p className="mty4 text-muted leading-relaxed">
        Canonizr extracts the text, images, and attachments from files,
        then returns to you in modern, standard, cross-platform formats.
      </p>
    </section>
  );
}
