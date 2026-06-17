import { Download } from "@/components/ui/icons";
import { IconLink } from "@/components/ui/icon-link";
import type { ArtefactEntry } from "@/lib/pure/artefacts";

export interface PreviewStripProps {
  previews: ArtefactEntry[];
  artefactUrl?: (jobId: string, name: string) => string;
  jobId: string;
}

export function PreviewStrip({ previews, artefactUrl, jobId }: PreviewStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {previews.map((p) => {
        const pageNum = p.name.replace("preview-", "");
        const pageName = `page-${pageNum}`;
        const pageLabel = `Page ${pageNum}`;
        const pageUrl = artefactUrl?.(jobId, pageName);
        return (
          <div
            key={p.name}
            className="flex-none rounded border border-border bg-muted/30 overflow-hidden relative group"
            title={pageLabel}
          >
            {artefactUrl ? (
              <img
                src={artefactUrl(jobId, p.name)}
                alt={pageLabel}
                className="h-24 w-[68px] object-contain"
                loading="lazy"
              />
            ) : (
              <div className="h-24 w-[68px] flex items-center justify-center text-xs text-muted-foreground">
                {pageNum}
              </div>
            )}
            {pageUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                <IconLink
                  icon={Download}
                  title={`Download ${pageLabel}`}
                  href={pageUrl}
                  download={`${pageName}.png`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
