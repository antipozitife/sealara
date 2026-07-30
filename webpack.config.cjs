const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (_, argv = {}) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/index.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProduction ? "assets/js/[name].[contenthash:8].js" : "assets/js/[name].js",
      chunkFilename: isProduction ? "assets/js/[name].[contenthash:8].chunk.js" : "assets/js/[name].chunk.js",
      assetModuleFilename: "assets/media/[name].[contenthash:8][ext][query]",
      publicPath: "/",
      clean: true,
    },
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map",
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
      new webpack.DefinePlugin({
        __SEALARA_STANDALONE__: JSON.stringify(process.env.SEALARA_STANDALONE === "1"),
        __SEALARA_FRONTEND_DEMO__: JSON.stringify(
          process.env.SEALARA_FRONTEND_DEMO !== "0" || process.env.SEALARA_STANDALONE === "1",
        ),
      }),
      new HtmlWebpackPlugin({
        template: "./index.html",
        minify: isProduction
          ? {
              collapseWhitespace: true,
              removeComments: true,
              useShortDoctype: true,
            }
          : false,
      }),
    ],
    optimization: {
      runtimeChunk: "single",
      splitChunks: {
        chunks: "all",
        cacheGroups: {
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
            name: "react-vendor",
            priority: 20,
          },
        },
      },
    },
    performance: {
      hints: isProduction ? "warning" : false,
      maxAssetSize: 500_000,
      maxEntrypointSize: 700_000,
    },
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
          middlewares.splice(
            idx,
            0,
            {
              name: "uploads-proxy",
              middleware: createProxyMiddleware("/uploads", {
                target: "http://localhost:3001",
                changeOrigin: true,
              }),
            },
            {
              name: "api-proxy",
              middleware: createProxyMiddleware("/api", {
                target: "http://localhost:3001",
                changeOrigin: true,
              }),
            },
          );
        }
        return middlewares;
      },
    },
  };
};
