const session = require('express-session');
const PGSession = require('connect-pg-simple')(session);
const client = require('./db/index');

const sessionMiddleware = session({
  store: new PGSession({ client }),
  secret: process.env.SESSION_KEY,
  saveUninitialized: false,
  resave: false,
  cookie: {
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE, 10),
    secure: true
  }
});

console.log("session middleware", sessionMiddleware);

module.exports = { sessionMiddleware };