const express = require('express');

const router = express.Router();
const bcrypt = require('bcryptjs');
const { createToken, validateToken } = require('../JWT');

module.exports = (db, actions) => {
  const { getUserByEmail, getUserByUsername, registerUser, calculateDistanceKm, calculateTurnScore } = actions;

  // ****************************************************
  // http://localhost:8001/api/register
  router.post('/register', (req, res) => {
    const { username, email, password } = req.body;

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
        const hashedPassword = bcrypt.hashSync(password, 10);
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
      totalScore: 0
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
        score: turnsData.rows[0].score
      };

      finalData.turns.push(turnObject);
    }

    return res.json(finalData);
  });

  // ****************************************************
  // GET find user by email
  //
  // curl http://localhost:8001/api/users/email/kate@site.com
  router.get("/users/email/:email", (request, response) => {
    db.query(
      `
      SELECT
        * FROM users WHERE LOWER(email) = LOWER($1)`,
      [request.params.email]
    ).then(({ rows }) => {
      response.json(rows);
    });
  });

  // ****************************************************
  // GET find user by id
  //
  // curl http://localhost:8001/api/users/id/3
  router.get("/users/id/:user_id", (request, response) => {
    db.query(
      `
      SELECT
        * FROM users WHERE id = $1`,
      [request.params.user_id]
    ).then(({ rows }) => {
      response.json(rows[0]);
    });
  });


  // GET score for user
  // curl http://localhost:8001/api/users/score/103
  router.get("/users/:user_id/scores", (request, response) => {
    db.query(
      `
    SELECT SUM(score) as total FROM turns WHERE user_id = $1
    `,
      [request.params.user_id]
    ).then(({ rows }) => {
      console.log(rows);
      response.json({
        user_id: request.params.user_id,
        score: rows[0].total
      });
    });
  });


  // GET  global scores by user for leaderboard
  // curl http://localhost:8001/api/users/scores
  router.get("/users/scores", (request, response) => {
    db.query(
      `
    SELECT 
      user_id,
      (SELECT user_name FROM users WHERE users.id = user_id), 
      SUM(score) as total_for_game 
    FROM turns 
    GROUP BY game_id, user_id
    HAVING SUM(score) > 0
    ORDER BY user_id, SUM(score) desc`,
      []
    ).then(({ rows }) => {
      for (let i = rows.length - 1; i > 0; i--) {
        if (rows[i - 1].user_id === rows[i].user_id) {
          rows.splice(i, 1);
        }
      }
      rows.sort((a, b) => {
        return b.total_for_game - a.total_for_game;
      });
      response.json(rows);
    });
  });

  router.put("/calculate/:turn_id", (req, res) => {
    const { questionLat, questionLon, answerLat, answerLon } = req.body;
    console.log('Hello from req.body', req.body);

    const distanceKm = calculateDistanceKm(questionLat, questionLon, answerLat, answerLon);
    console.log(distanceKm);

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

  return router;
};