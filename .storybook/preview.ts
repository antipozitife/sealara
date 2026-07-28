import type { Preview } from "@storybook/react-webpack5";
import "../src/styles/global.css";

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
