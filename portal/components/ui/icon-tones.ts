// Single source of truth for icon tones, shared by IconButton/IconLink (interactive)
// and IconHint (static). `static` = resting colour; `interactive` = neutral-at-rest,
// tone-on-hover. They differ deliberately, so each consumer reads the part it needs.
export const iconTones = {
  muted: { static: "text-muted-foreground", interactive: "text-muted-foreground hover:text-primary" },
  foreground: { static: "text-primary", interactive: "text-primary" },
  accent: { static: "text-accent", interactive: "text-accent/80 hover:text-accent" },
  destructive: { static: "text-destructive", interactive: "text-muted-foreground hover:text-destructive/80" },
} as const;

export type IconTone = keyof typeof iconTones;
