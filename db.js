import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  user: "commonry_user",
  host: "localhost",
  database: "commonry_db",
  password: "Samma-Vayama78!",
  port: 5432,
});

export default pool;
