const rules = require('./webpack.rules');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
  devServer: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'",
    },
  },
};
