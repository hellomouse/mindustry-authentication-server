// @ts-check
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const db = require('./db.js');
const config = require('./config.js');
const common = require('./common.js');
const log = require('./logger.js');
const env = process.env;

let router = express.Router(); // eslint-disable-line new-cap
let jsonParse = bodyParser.json();

/**
 * Wraps an async function handler
 * @param {express.RequestHandler} fn
 * @return {express.RequestHandler}
 */
function wrap(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

/**
 * Validate a session
 * @param {express.Request} req
 * @param {express.Response} res
 * @return {Promise<{ user: string, token: string} | null>}
 */
async function validateSession(req, res) {
  let sessionHeader = req.headers['session'];
  if (!sessionHeader) {
    log.verbose('authenticated endpoint called without session');
    res.status(400).send({
      status: 'error',
      error: 'NO_SESSION',
      description: 'a session was not provided'
    });
    return null;
  }
  let sessionToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

  let session = (await db.query(
    'SELECT username, expires FROM sessions WHERE token = $1',
    [sessionToken]
  )).rows[0];
  if (!session) {
    log.verbose('session not found');
    res.status(401).send({
      status: 'error',
      error: 'INVALID_SESSION',
      description: 'provided session does not exist'
    });
    return null;
  }
  if (+session.expires < Date.now()) {
    log.verbose('session expired');
    res.status(401).send({
      status: 'error',
      error: 'INVALID_SESSION',
      description: 'provided session does not exist'
    });
    await db.query('DELETE FROM sessions WHERE token = $1', [sessionToken]);
    return null;
  }

  return {
    user: session.username,
    token: sessionToken
  };
}

// web application
router.get('/', (req, res) => res.redirect('/app/'));
router.use('/app/*', express.static('public'));

router.get('/api/info', (req, res) => {
  res.status(200).send({
    status: 'ok',
    baseURL: env.BASE_URL,
    registrationEnabled: config.ENABLE_REGISTRATION,
    loginNotice: config.LOGIN_NOTICE
  });
});

router.get('/api/session', wrap(async (req, res) => {
  let session = await validateSession(req, res);
  if (!session) return;
  res.status(200).send({
    status: 'ok',
    user: session.user
  });
}));

router.post('/api/login', jsonParse, wrap(async (req, res) => {
  if (!req.body.username || !req.body.password) {
    log.verbose('login request failed (bad request)');
    return res.status(400).send({
      status: 'error',
      error: 'BAD_REQUEST',
      description: 'required fields were not provided'
    });
  }

  log.debug('handle login request', { user: req.body.user });
  let user = (await db.query(
    'SELECT username, password, disabled FROM users WHERE username = $1',
    [req.body.username]
  )).rows[0];
  if (!user) {
    log.verbose('login request failed (user not found)', { user: req.body.username });
    return res.status(401).send({
      status: 'error',
      error: 'INVALID_CREDENTIALS',
      description: 'username or password is incorrect'
    });
  }
  if (user.disabled) {
    log.verbose('login request failed (account disabled)', { user: user.username });
    return res.status(403).send({
      status: 'error',
      error: 'ACCOUNT_DISABLED',
      description: 'the requested account has been disabled'
    });
  }
  if (await bcrypt.compare(req.body.password, user.password)) {
    log.info('login request succeeded', { user: user.username });
    let sessionToken = common.generateToken();
    let expires = new Date(Date.now() + config.SESSION_EXPIRY * 1000);
    let uuid = req.body.uuid || null;
    await db.query(
      'INSERT INTO sessions (username, token, expires, uuid) VALUES ($1, $2, $3, $4)',
      [user.username, sessionToken, expires, uuid]
    );
    res.status(201).send({
      status: 'ok',
      username: user.username, // ensure username is case-correct
      expiry: +expires,
      token: sessionToken
    });
    await Promise.all([
      // add ip to user info
      db.query(
        'UPDATE users SET ips = ARRAY(SELECT DISTINCT unnest FROM ' +
          'unnest(array_append(ips, $2::inet))) WHERE username = $1',
        [user.username, common.normalizeIp(req.ip)]
      ),
      // delete oldest session if above max session count
      (async () => {
        let result = await db.query(
          'SELECT expires FROM sessions WHERE username = $1 ORDER BY expires DESC',
          [user.username]
        );
        if (result.rowCount > config.MAX_SESSIONS) {
          let target = result.rows[config.MAX_SESSIONS - 1].expires;
          target = new Date(Math.max(Date.now(), target));
          await db.query(
            'DELETE FROM sessions WHERE username = $1 AND expires < $2',
            [user.username, target]
          );
        }
      })()
    ]);
  } else {
    log.verbose('login request failed (bad password)', { user: user.username });
    return res.status(401).send({
      status: 'error',
      error: 'INVALID_CREDENTIALS',
      description: 'username or password is incorrect'
    });
  }
}));

router.post('/api/logout', wrap(async (req, res) => {
  let session = req.headers['session'];
  if (!session) {
    log.verbose('logout called without session');
    return res.status(400).send({
      status: 'error',
      error: 'NO_SESSION',
      description: 'a session was not provided'
    });
  }
  let result = await db.query('DELETE FROM sessions WHERE token = $1', [session]);
  if (result.rowCount > 0) {
    log.verbose('logout successful');
    res.status(200).send({ status: 'ok' });
  } else {
    log.verbose('logout called with invalid session');
    res.status(404).send({
      status: 'error',
      error: 'INVALID_SESSION',
      description: 'provided session does not exist'
    });
  }
}));

router.post('/api/doconnect', jsonParse, wrap(async (req, res) => {
  let session = await validateSession(req, res);
  if (!session) return;
  if (!req.body.serverHash) {
    log.verbose('doconnect called with missing parameters');
    return res.status(400).send({
      status: 'error',
      error: 'BAD_REQUEST',
      description: 'required parameters were not provided'
    });
  }
  let serverHash = Buffer.from(req.body.serverHash, 'hex');
  if (serverHash.length !== 32) {
    log.verbose('doconnect passed with invalid server hash');
    return res.status(400).send({
      status: 'error',
      error: 'INVALID_SERVER_HASH',
      description: 'provided server hash is invalid'
    });
  }
  let connectToken = common.generateToken();
  let expires = new Date(Date.now() + config.CONNECT_EXPIRY * 1000);
  let ip = common.normalizeIp(req.ip);
  await db.query(
    'INSERT INTO connecting (username, token, serverhash, ip, expires) VALUES ($1, $2, $3, $4, $5)',
    [session.user, connectToken, serverHash, ip, expires]
  );
  res.status(201).send({
    status: 'ok',
    token: connectToken
  });
  log.info('connect request successful', { user: session.user, serverHash: serverHash.toString('hex') });
  await Promise.all([
    // add ip to user info
    db.query(
      'UPDATE users SET ips = ARRAY(SELECT DISTINCT unnest FROM ' +
        'unnest(array_append(ips, $2::inet))) WHERE username = $1',
      [session.user, ip]
    ),
    // delete oldest connect requests if above maximum allowed
    (async () => {
      let result = await db.query(
        'SELECT expires FROM connecting WHERE username = $1 ORDER BY expires DESC',
        [session.user]
      );
      if (result.rowCount > config.MAX_CONNECT_REQUESTS) {
        let target = result.rows[config.MAX_CONNECT_REQUESTS - 1].expires;
        target = new Date(Math.max(Date.now(), target));
        await db.query(
          'DELETE FROM connecting WHERE username = $1 AND expires < $2',
          [session.user, target]
        );
      }
    })()
  ]);
}));

router.post('/api/verifyconnect', jsonParse, wrap(async (req, res) => {
  if (!req.body.token || !req.body.username || !req.body.serverId) {
    log.verbose('verifyconnect called with missing parameters');
    return res.status(400).send({
      status: 'error',
      error: 'BAD_REQUEST',
      description: 'required fields were not provided'
    });
  }
  if (req.body.serverId.length > 256) {
    log.verbose('verifyconnect called with very long serverId');
    return res.status(400).send({
      status: 'error',
      error: 'INVALID_SERVER_ID',
      description: 'server id is too long'
    });
  }

  let connectRequest = (await db.query(
    'SELECT username, serverhash, ip, expires FROM connecting WHERE token = $1',
    [req.body.token]
  )).rows[0];
  if (!connectRequest) {
    log.verbose('connect verify failed (no such token)');
    return res.status(404).send({
      status: 'error',
      error: 'NO_SUCH_TOKEN',
      description: 'invalid connect token'
    });
  } else if (connectRequest.expires < Date.now()) {
    log.verbose('connect verify failed (token expired)');
    res.status(404).send({
      status: 'error',
      error: 'TOKEN_EXPIRED',
      description: 'connect token expired'
    });
  } else if (req.body.username !== connectRequest.username) {
    log.verbose('connect verify failed (username mismatch)');
    res.status(409).send({
      status: 'error',
      error: 'USERNAME_MISMATCH',
      description: 'username mismatch in connect token'
    });
  } else if (req.body.ip && common.normalizeIp(req.body.ip) !== connectRequest.ip) {
    log.verbose('connect verify failed (ip mismatch)', {
      client: connectRequest.ip,
      server: req.body.ip
    });
    res.status(409).send({
      status: 'error',
      error: 'IP_MISMATCH',
      description: 'ip mismatch in connect token'
    });
  } else {
    let hash = crypto.createHash('sha256');
    hash.update(Buffer.from(req.body.serverId, 'base64'));
    let serverHash = hash.digest();
    if (!serverHash.equals(connectRequest.serverhash)) {
      res.status(409).send({
        status: 'error',
        error: 'SERVER_ID_MISMATCH',
        description: 'server id mismatch in connect token'
      });
    } else {
      log.info('connect verify successful', {
        user: connectRequest.username,
        serverHash: serverHash.toString('hex')
      });
      res.status(200).send({ status: 'ok' });
    }
  }
  await db.query('DELETE FROM connecting WHERE token = $1', [req.body.token]);
}));

module.exports = router;
