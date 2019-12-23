// @ts-check
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const fsP = fs.promises;
const app = require('./app.js');
const log = require('./logger.js');
const env = process.env;

/** Main function */
async function main() {
  /** @type {http.Server | https.Server} */
  let server;
  if (env.TLS === 'true') {
    if (!env.TLS_CERT || !env.TLS_KEY) throw new Error('no tls key or cert specified');
    server = https.createServer({
      cert: await fsP.readFile(env.TLS_CERT),
      key: await fsP.readFile(env.TLS_KEY)
    }, app);
  } else server = http.createServer(app);
  server.listen(env.PORT).on('listening', () => log.info('Listening'));
}
main();
