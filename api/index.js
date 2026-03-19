require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || "4000"),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      { rejectUnauthorized: true }, 
  waitForConnections: true,
  connectionLimit: 5,
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS conceptos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL,
        descripcion TEXT,
        creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS destinos (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        nombre    VARCHAR(100) NOT NULL,
        ciudad    VARCHAR(80),
        estado    VARCHAR(80),
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS productos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL,
        descripcion TEXT,
        precio      DECIMAL(10,2) DEFAULT 0,
        creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS unidades (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        nombre       VARCHAR(80) NOT NULL,
        abreviatura  VARCHAR(20),
        creado_en    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅  Tablas verificadas/creadas en TiDB Cloud");
  } finally {
    conn.release();
  }
}

function buildCatalogRouter(table, fields) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM ${table} ORDER BY creado_en DESC`
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const values = fields.map((f) => req.body[f] ?? null);
      const placeholders = fields.map(() => "?").join(", ");
      const cols = fields.join(", ");
      const [result] = await pool.execute(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
        values
      );
      res.status(201).json({ id: result.insertId, message: "Registro creado" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const sets = fields.map((f) => `${f} = ?`).join(", ");
      const values = [...fields.map((f) => req.body[f] ?? null), req.params.id];
      await pool.execute(`UPDATE ${table} SET ${sets} WHERE id = ?`, values);
      res.json({ message: "Registro actualizado" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ message: "Registro eliminado" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

app.use("/api/conceptos", buildCatalogRouter("conceptos", ["nombre", "descripcion"]));
app.use("/api/destinos",  buildCatalogRouter("destinos",  ["nombre", "ciudad", "estado"]));
app.use("/api/productos", buildCatalogRouter("productos", ["nombre", "descripcion", "precio"]));
app.use("/api/unidades",  buildCatalogRouter("unidades",  ["nombre", "abreviatura"]));

app.get("/api/ping", (req, res) => res.json({ status: "ok" }));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀  Servidor corriendo en http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌  Error al conectar con TiDB Cloud:", err.message);
    process.exit(1);
  });

module.exports = app; 
