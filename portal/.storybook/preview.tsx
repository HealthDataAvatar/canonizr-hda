import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";
import "../app/hljs-theme.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {},
    nextjs: {
      appDirectory: true,
    },
    viewport: {
      viewports: {
        mobile: { name: "Mobile", styles: { width: "375px", height: "667px" } },
        tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" } },
      },
    },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#faf9f7" },
        { name: "dark", value: "#1f1d1a" },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const bg = context.globals.backgrounds?.value;
      const isDark = bg === "#1f1d1a";
      return (
        <div className={isDark ? "dark" : ""}>
          <div className="bg-white text-foreground p-1">
            <Story />
          </div>
        </div>
      );
    },
  ],
};

export default preview;
