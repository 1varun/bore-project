const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());

// DB CONNECTION
const pool = new Pool({
  host: "database",
  user: "admin",
  password: "boreproject",
  database: "boredb",
  port: 5432,
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "backend running" });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Create table
const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id SERIAL PRIMARY KEY,
      rpm INT,
      pressure INT,
      depth INT,
      time TIMESTAMP
    );
  `);
};
initDB();

// WebSocket
io.on("connection", (socket) => {
  console.log("Client connected");

  setInterval(async () => {
    const data = {
      rpm: Math.floor(Math.random() * 200),
      pressure: Math.floor(Math.random() * 5000),
      depth: Math.floor(Math.random() * 3000),
      time: new Date(),
    };

    // Save to DB
    await pool.query(
      "INSERT INTO sensor_data (rpm, pressure, depth, time) VALUES ($1, $2, $3, $4)",
      [data.rpm, data.pressure, data.depth, data.time]
    );

    socket.emit("sensor", data);
  }, 2000);
});

server.listen(5000, () => {
  console.log("Backend running on port 5000");
});