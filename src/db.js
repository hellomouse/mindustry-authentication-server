// @ts-check
const log = require('./logger.js');
const { Pool } = require('pg');
const createSubscriber = require('pg-listen').default;
const config = require('./config.js');

const pool = new Pool();
pool.on('error', err => {
  log.error('Database connection encountered error:', err);
});

const subscriber = createSubscriber();

subscriber.notifications.on('registration_succeeded', async user => {
  let registration = (await pool.query(
    'SELECT username, password, ips, succeeded FROM pending_registrations WHERE username = $1',
    [user]
  )).rows[0];
  if (!registration) {
    log.warn('received registration_succeeded event, but could not find user', user);
    return;
  }
  if (!registration.succeeded) {
    log.warn('received registration_succeeded event, but registration was not marked as succeeed', user);
    return;
  }
  await pool.query(
    'INSERT INTO users (username, password, ips, disabled) ' +
      'VALUES ($1, $2, $3::inet[], FALSE)',
    [
      registration.username,
      registration.password,
      registration.ips
    ]
  );
  await pool.query('DELETE FROM pending_registrations WHERE username = $1', [user]);
  log.verbose('user registration successful', user);
});

/** set up listeners for database events */
async function doListen() {
  await subscriber.connect();
  await subscriber.listenTo('registration_succeeded');
}
doListen();

/** do periodic cleanup of expired entries from tables */
async function cleanup() {
  log.debug('starting database cleanup of expired entries');
  await Promise.all([
    pool.query('DELETE FROM pending_registrations WHERE expires < now()'),
    pool.query('DELETE FROM sessions WHERE expires < now()'),
    pool.query('DELETE FROM connecting WHERE expires < now()')
  ]);
  log.verbose('database expired entries cleanup successful');
}
if (config.DB_CLEANUP_TIME) setInterval(cleanup, config.DB_CLEANUP_TIME * 1000);

module.exports = pool;
