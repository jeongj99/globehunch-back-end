const PORT = process.env.PORT || 8001;
const http = require('http');
const ENV = require('./environment');

// Register/Login Helper functions
const getUserByEmail = (db, email) => {
  const queryString = `
  SELECT *
  FROM users
  WHERE email = $1
  `;
  return db.query(queryString, [email])
    .then(result => {
      console.log(result.rows[0]);
      return result.rows[0];
    })
    .catch(error => {
      console.log(error.message);
    });
};

const getUserByUsername = (db, username) => {
  const queryString = `
  SELECT *
  FROM users
  WHERE user_name = $1
  `;
  return db.query(queryString, [username])
    .then(result => {
      return result.rows[0];
    })
    .catch(error => {
      console.log(error.message);
    });
};

const registerUser = (db, username, email, hashedPassword) => {
  const queryString = `
  INSERT INTO users (user_name, password_hash, email)
  VALUES ($1, $2, $3)
  RETURNING *
  `;
  const params = [username, hashedPassword, email];

  return db.query(queryString, params)
    .then(result => {
      return result.rows[0];
    })
    .catch(error => {
      console.log(error.message);
    });
};

// Helper functions to calculate distance and score
const calculateDistanceKm = (questionLat, questionLon, answerLat, answerLon) => {

  const R = 6371.0710;
  const rlat1 = questionLat * (Math.PI / 180); // Convert degrees to radians
  const rlat2 = answerLat * (Math.PI / 180); // Convert degrees to radians
  const difflat = rlat2 - rlat1; // Radian difference (latitudes)
  const difflon = (answerLon - questionLon) * (Math.PI / 180); // Radian difference (longitudes)

  const d = 2 * R * Math.asin(Math.sqrt(Math.sin(difflat / 2) * Math.sin(difflat / 2) + Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(difflon / 2) * Math.sin(difflon / 2)));
  return Math.round(d);
};

const calculateTurnScore = distanceKm => {
  const multiplier = 0.5;

  const roundScore = 5000 - (distanceKm * multiplier);

  if (roundScore < 0) {
    return 0;
  }

  return Math.round(roundScore);
};

const app = require('./application')(ENV, {
  getUserByEmail,
  getUserByUsername,
  registerUser,
  calculateDistanceKm,
  calculateTurnScore
});
const server = http.Server(app);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT} in ${ENV} mode.`);
});
