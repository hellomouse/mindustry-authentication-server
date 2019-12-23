const crypto = require('crypto');
const ipaddr = require('ipaddr.js');

module.exports = {
  generateToken() {
    return crypto.randomBytes(24).toString('base64');
  },
  normalizeIp(ip) {
    try {
      return ipaddr.process(ip).toString();
    } catch (err) {
      return null;
    }
  }
};
