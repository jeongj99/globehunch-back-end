const fs = require("fs");
const path = require("path");

const express = require("express");
const bodyparser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");

const app = express();
const db = require("./db");

const { sessionMiddleware } = require('./serverController');

const games = require("./routes/games");

const read = file => {
  return new Promise((resolve, reject) => {
    fs.readFile(
      file,
      {
        encoding: "utf-8"
      },
      (error, data) => {
        if (error) return reject(error);
        resolve(data);
      }
    );
  });
};

const application = (
  ENV,
  actions = {
    getUserByEmail: () => {},
    getUserByUsername: () => {},
    registerUser: () => {},
    calculateDistanceKm: () => {},
    calculateTurnScore: () => {}
  }
) => {
  app.use(cors({ credentials: true, origin: true }));
  app.use(helmet());
  app.use(bodyparser.json());

  app.use(sessionMiddleware);

  app.use("/api", games(db, actions));

  if (ENV === "development" || ENV === "test" || ENV === "production") {
    Promise.all([
      read(path.resolve(__dirname, `db/schema/create.sql`)),
      read(path.resolve(__dirname, `db/schema/${ENV}.sql`))
    ])
      .then(([create, seed]) => {
        app.get("/api/debug/reset", (request, response) => {
          db.query(create)
            .then(() => db.query(seed))
            .then(() => {
              console.log("Database Reset");
              response.status(200).send(`${ENV} Database Reset`);
            });
        });
      })
      .catch(error => {
        console.log(`Error setting up the reset route: ${error}`);
      });
  }

  app.close = function() {
    return db.end();
  };

  return app;
};

module.exports = application;