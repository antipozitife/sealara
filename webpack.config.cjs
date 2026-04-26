const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    publicPath: "/",
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/i,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index.html",
    }),
  ],
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
    // Proxy must run before webpack-dev-middleware; the built-in `proxy` option
    // is registered too late, so /api falls through to the SPA (404 on POST).
    setupMiddlewares(middlewares) {
      const { createProxyMiddleware } = require("http-proxy-middleware");
      const idx = middlewares.findIndex((m) => m.name === "webpack-dev-middleware");
      if (idx !== -1) {
        middlewares.splice(idx, 0, {
          name: "api-proxy",
          middleware: createProxyMiddleware("/api", {
            target: "http://localhost:3001",
            changeOrigin: true,
          }),
        });
      }
      return middlewares;
    },
  },
};
