// @ts-check
const express = require('express');
const morgan = require('morgan');
const log = require('./logger.js');
const api = require('./api.js');
const { BASE_URL } = require('./config.js');

let app = express();

app.set('trust proxy', 'loopback');

app.use(morgan('combined', {
  stream: {
    write(line) {
      log.info(line.replace(/\n$/g, ''));
    }
  }
}));

app.use(BASE_URL.pathname, api);

module.exports = app;
