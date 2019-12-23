const { URL } = require('url');
const env = process.env;

if (!env.BASE_URL) throw new Error('BASE_URL not set');

module.exports = {
  BASE_URL: new URL(env.BASE_URL),
  ENABLE_REGISTRATION: env.ENABLE_REGISTRATION === 'true',
  LOGIN_NOTICE: env.LOGIN_NOTICE || null,
  SESSION_EXPIRY: env.SESSION_EXPIRY ? +env.SESSION_EXPIRY : 604800,
  CONNECT_EXPIRY: env.CONNECT_EXPIRY ? +env.CONNECT_EXPIRY : 60,
  DB_CLEANUP_TIME: env.DB_CLEANUP_TIME ? +env.DB_CLEANUP_TIME : null,
  MAX_SESSIONS: env.MAX_SESSIONS ? +env.MAX_SESSIONS : 10,
  MAX_CONNECT_REQUESTS: env.MAX_CONNECT_REQUESTS ? +env.MAX_CONNECT_REQUESTS : 5
};
