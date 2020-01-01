// see: https://github.com/zeit/next-plugins/blob/master/packages/next-sass/index.js
// see: react-scripts webpack.config.js
const ExtractCssChunks = require('extract-css-chunks-webpack-plugin');
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin');

const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

module.exports = {
  webpack(config, options) {
    let getStyleLoaders = cssOptions => {
      if (options.isServer && !cssOptions.modules) return ['ignore-loader'];

      let cssLoader = {
        loader: 'css-loader',
        options: {
          modules: cssOptions.modules
            ? { localIdentName: '[path][name]__[local]--[hash:base64:5]' }
            : false,
          sourceMap: options.dev,
          importLoaders: 2,
          onlyLocals: options.isServer
        }
      };

      let postcssLoader = {
        loader: 'postcss-loader',
        options: {
          ident: 'postcss',
          plugins: () => [
            require('postcss-flexbugs-fixes'),
            require('postcss-preset-env')({
              autoprefixer: { flexbox: 'no-2009' },
              stage: 3
            }),
            require('postcss-normalize')()
          ],
          sourceMap: options.dev
        }
      };

      let resolveUrlLoader = {
        loader: 'resolve-url-loader',
        options: {
          sourceMap: options.dev
        }
      };

      let sassLoader = {
        loader: 'sass-loader',
        options: {
          sourceMap: options.dev
        }
      };

      if (options.isServer && cssOptions.modules) {
        return [
          cssLoader,
          postcssLoader,
          resolveUrlLoader,
          sassLoader
        ];
      }
      return [
        !options.isServer && ExtractCssChunks.loader,
        cssLoader,
        postcssLoader,
        resolveUrlLoader,
        sassLoader
      ].filter(Boolean);
    };

    if (!options.isServer) {
      config.optimization.splitChunks.cacheGroups.styles = {
        name: 'styles',
        test: sassRegex,
        chunks: 'all',
        enforce: true
      };

      config.plugins.push(
        new ExtractCssChunks({
          filename: options.dev
            ? 'static/chunks/[name].css'
            : 'static/chunks/[name].[contenthash:8].css',
          chunkFilename: options.dev
            ? 'static/chunks/[name].chunk.css'
            : 'static/chunks/[name].[contenthash:8].chunk.css',
          hot: options.dev
        })
      );
    }

    if (!options.dev) {
      if (!Array.isArray(config.optimization.minimizer)) {
        config.optimization.minimizer = [];
      }

      config.optimization.minimizer.push(
        new OptimizeCssAssetsWebpackPlugin({
          cssProcessorOptions: {
            discardComments: { removeAll: true }
          }
        })
      );
    }

    config.module.rules.push(
      {
        test: sassRegex,
        exclude: sassModuleRegex,
        use: getStyleLoaders({ modules: false }),
        sideEffects: true
      },
      {
        test: sassModuleRegex,
        use: getStyleLoaders({ modules: true }),
        sideEffects: true
      }
    );

    return config;
  }
};
