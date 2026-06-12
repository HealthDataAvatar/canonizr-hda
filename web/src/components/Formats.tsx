import { formats } from "../data/formats";
import { Section, SectionHeading } from "./ui";

export function Formats() {
  return (
    <Section id="formats">
      <SectionHeading>Supported Formats</SectionHeading>
      <p className="mt-2 text-muted">
        Every format produces the same clean markdown output.
      </p>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-medium text-muted">
              <th className="pb-2 pr-8 font-medium">Format</th>
              <th className="pb-2 font-medium">Extensions</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((f) => (
              <tr key={f.format} className="border-b last:border-0">
                <td className="py-2.5 pr-8 font-medium">{f.format}</td>
                <td className="py-2.5 font-mono text-xs text-muted">
                  {f.extensions.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
