const express = require('express');

const router = express.Router();
const bcrypt = require('bcryptjs');
const { createToken, validateToken } = require('../JWT');

module.exports = (db, actions) => {
  const { getUserByEmail, getUserByUsername, registerUser, calculateDistanceKm, calculateTurnScore } = actions;

  // ****************************************************
  // http://localhost:8001/api/register
  router.post('/register', (req, res) => {
    const { username, email, passwordRegister } = req.body;
    console.log(req.body);

    getUserByEmail(db, email).then(user => {
      if (user) {
        return res.status(400).json({
          error: 'Email exists',
          message: 'An account with this email already exists!'
        });
      }
      getUserByUsername(db, username).then(user => {
        if (user) {
          return res.status(400).json({
            error: 'Username exists',
            message: 'This username has already been taken!'
          });
        }
        const hashedPassword = bcrypt.hashSync(passwordRegister, 10);
        registerUser(db, username, email, hashedPassword).then(registered => {
          const accessToken = createToken(registered);

          req.session.accessToken = accessToken;

          const loggedInUser = {
            id: registered.id,
            username: registered.user_name
          };
          return res.json({ error: null, authenticated: true, loggedInUser });
        })
          .catch(error => {
            res.status(400).json({ error });
          });
      });
    });
  });

  router.post("/login", (req, res) => {
    const { email, password } = req.body;

    getUserByEmail(db, email).then(user => {
      if (user && bcrypt.compareSync(password, user.password_hash)) {
        const accessToken = createToken(user);

        req.session.accessToken = accessToken;

        const loggedInUser = {
          id: user.id,
          username: user.user_name
        };

        return res.json({ error: null, authenticated: true, loggedInUser });
      }
      return res.status(400).json({ error: 'Incorrect email or password!' });
    });
  });

  router.post("/authenticate", validateToken, (req, res) => {
    const { authenticated, user } = req;
    return res.json({ authenticated, user });
  });

  router.post("/logout", validateToken, (req, res) => {
    req.session.destroy();
    return res.json({ error: null, auth: false });
  });

  // get user's games
  // curl http://localhost:8001/api/games/3
  router.get("/games/:user_id", (request, response) => {
    db.query(
      `
      SELECT
        * FROM games WHERE user_id = $1`,
      [request.params.user_id]
    ).then(({ rows }) => {
      response.json(rows);
    });
  });

  // ****************************************************
  // POST create new game
  // curl --request POST http://localhost:8001/api/games/3
  router.post("/games", validateToken, async (req, res) => {
    const loggedInUserID = req.user.id;

    const allQuestions = await (db.query(
      `
      SELECT id as question_id, latitude, longitude
      FROM questions;
      `
    ));

    const selectedQuestions = [];
    for (let i = 0; i < 3; i++) {
      const n = Math.floor(Math.random() * allQuestions.rows.length);
      selectedQuestions.push(allQuestions.rows[n]);
      allQuestions.rows.splice(n, 1);
    }

    const gameData = await (db.query(
      `
      INSERT INTO games (user_id, start_time)
      VALUES ($1, NOW())
      RETURNING id;
      `, [loggedInUserID]
    ));

    const finalData = {
      gameID: gameData.rows[0].id,
      turns: [],
      currentTurn: 1,
      totalScore: 0,
      popupMessageStatus: false,
      errorMessageStatus: false,
      finishedGame: false
    };

    for (let i = 0; i < 3; i++) {
      const turnsData = await db.query(
        `
        INSERT INTO TURNS (user_id, game_id, question_id, turn_number, score)
        VALUES ($1, $2, $3, $4, null)
        RETURNING *;
        `, [loggedInUserID, gameData.rows[0].id, selectedQuestions[i].question_id, i + 1]
      );

      const turnObject = {
        id: turnsData.rows[0].id,
        turnNumber: turnsData.rows[0].turn_number,
        questionID: turnsData.rows[0].question_id,
        latitude: selectedQuestions[i].latitude,
        longitude: selectedQuestions[i].longitude,
        answerPosition: null,
        distance: null,
        score: turnsData.rows[0].score
      };

      finalData.turns.push(turnObject);
    }
    return res.json(finalData);
  });

  router.put("/calculate/:turn_id", validateToken, (req, res) => {
    const { questionLat, questionLon, answerLat, answerLon } = req.body;

    const distanceKm = calculateDistanceKm(questionLat, questionLon, answerLat, answerLon);

    const score = calculateTurnScore(distanceKm);

    db.query(
      `
        UPDATE turns
        SET score = $1
        WHERE id = $2
        RETURNING score
      `, [score, req.params.turn_id]
    ).then(result => {
      const turnScore = result.rows[0].score;
      return res.json({ turnScore, distanceKm });
    });
  });

  // GET  global scores by user for leaderboard
  // curl http://localhost:8001/api/users/scores
  router.get("/users/scores", validateToken, (req, res) => {
    db.query(
      `
      SELECT
        u.id AS user_id,
        u.user_name,
        MAX(total_game_score) AS highest_game_score
      FROM users u
      JOIN (
        SELECT
          user_id,
          game_id,
          SUM(score) AS total_game_score
        FROM turns
        WHERE score > 0
        GROUP BY user_id, game_id
      ) t ON u.id = t.user_id
      GROUP BY u.id, u.user_name
      ORDER BY highest_game_score DESC;`
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  // TEST ROUTES FOR DEPLOYMENT
  router.get("/users", (req, res) => {
    db.query(
      `
      SELECT * FROM users;
      `
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  router.get("/games", (req, res) => {
    db.query(
      `
      SELECT * FROM games;
      `
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  router.get("/questions", (req, res) => {
    db.query(
      `
      SELECT * FROM questions;
      `
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  router.get("/turns", (req, res) => {
    db.query(
      `
      SELECT * FROM turns;
      `
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  router.get("/session", (req, res) => {
    db.query(
      `
      SELECT * FROM session;
      `
    ).then(({ rows }) => {
      res.json(rows);
    });
  });

  return router;
};