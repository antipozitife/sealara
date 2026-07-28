import type { StorybookConfig } from "@storybook/react-webpack5";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  docs: { autodocs: "tag" },
  webpackFinal: async (webpackConfig) => {
    webpackConfig.module?.rules?.push({
      test: /\.tsx?$/,
      exclude: /node_modules/,
      use: {
        loader: "ts-loader",
        options: {
          transpileOnly: true,
          compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
        },
      },
    });
    webpackConfig.resolve?.extensions?.push(".ts", ".tsx");
    return webpackConfig;
  },
};

export default config;
