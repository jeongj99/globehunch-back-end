const pg = require("pg");

const client = new pg.Client({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: process.env.PGHOST !== 'localhost', // Enable SSL unless the host is 'localhost'
  rejectUnauthorized: false // Bypass SSL certificate validation for testing (only use for local development)
});

client
  .connect()
  .catch(e => console.log(`Error connecting to Postgres server:\n${e}`));

module.exports = client;
