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
      values: [{ name: "light", value: "#faf9f7" }],
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-white text-primary p-1">
        <Story />
      </div>
    ),
  ],
};

export default preview;
