// @ts-check
const express = require('express');
const morgan = require('morgan');
const next = require('next').default;
const log = require('./logger.js');
const api = require('./api.js');
const { BASE_URL } = require('./config.js');

let nextApp = next({
  dev: process.env.NODE_ENV !== 'production'
});
let handleNext = nextApp.getRequestHandler();
let app = express();

app.set('trust proxy', 'loopback');

app.use(morgan('combined', {
  stream: {
    write(line) {
      log.info(line.replace(/\n$/g, ''));
    }
  }
}));

// web application
nextApp.prepare().then(() => {
  app.use('/', (req, res) => {
    handleNext(req, res);
  });
});

app.use(BASE_URL.pathname, api);

module.exports = app;
