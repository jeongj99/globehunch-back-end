const { sign, verify } = require('jsonwebtoken');

const createToken = user => {
  const accessToken = sign(
    {
      id: user.id,
      username: user.user_name
    },
    process.env.JWT_SECRET
  );

  return accessToken;
};

const validateToken = (req, res, next) => {
  const { accessToken } = req.session;

  if (!accessToken) {
    console.log('wrong 1');
    return res.status(400).json({ error: 'User not authenticated' });
  }

  verify(accessToken, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(400).json({ error });
    }
    req.authenticated = true;
    req.user = {
      id: decoded.id,
      username: decoded.username
    };
    return next();
  });
};

module.exports = { createToken, validateToken };