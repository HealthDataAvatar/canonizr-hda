<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Component Rules

- **No fetch in components** — components are pure UI. All API calls (`fetch`, mutations) go in hooks (`lib/hooks/`). Components call hooks, never `fetch` directly.

# Storybook Stories

When writing or modifying stories, follow the style guide in `docs/issues/portal-ui-stories.md` (section "Style Guide"). Key rules:

- **CSF3 only** — `export const Name: Story = { ... }`, never Template.bind
- **Live components** — import the real component, never a simplified copy
- **`Showcase` helper** — use `Showcase` from `.storybook/common.tsx` for AllStates grids, don't duplicate the label+wrapper boilerplate
- **Test data** — use shared constants from `.storybook/common.tsx` (`TEST_KEY_VALUES`, `TEST_KEY_NAMES`, `TEST_EMAILS`, `TEST_JOB_IDS`), realistic production formats
- **Naming** — PascalCase export names (`AllStates`, `Interactive`, `Empty`), no `.name` overrides
- **Title hierarchy** — `"UI/Button"`, `"Components/KeyTable"`, `"Pages/Auth"`
- **Edge cases** — always include: empty, loading, error, long content overflow, boundary values
- **Few files, many variants** — prefer one AllStates story with many labelled variants over many single-variant stories
