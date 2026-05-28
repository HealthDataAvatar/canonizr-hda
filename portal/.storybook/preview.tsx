import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "oklch(0.985 0.005 45)" },
        { name: "dark", value: "oklch(0.13 0.005 45)" },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const bg = context.globals.backgrounds?.value;
      const isDark = bg === "oklch(0.13 0.005 45)";
      return (
        <div className={isDark ? "dark" : ""}>
          <div className="bg-background text-foreground p-8">
            <Story />
          </div>
        </div>
      );
    },
  ],
};

export default preview;
