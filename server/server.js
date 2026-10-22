const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

// ── Environment guard ─────────────────────────────────────────────────────────
if (!process.env.MONGO_URI)   throw new Error("❌ MONGO_URI is not set in .env");
if (!process.env.JWT_SECRET)  throw new Error("❌ JWT_SECRET is not set in .env");


const authRoutes = require("./routes/auth");
const fingerprintRoutes = require("./routes/fingerprint");
const accessRequestRoutes = require("./routes/accessRequests");

const app = express();

// ── Security & logging ──────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true,
}));
app.use(express.json());

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Too many requests from this IP, please try again later." },
});
app.use("/api", limiter);

// ── Database ─────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((error) => console.log("❌ MongoDB connection failed:", error.message));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/fingerprint", fingerprintRoutes);
app.use("/api/access-requests", accessRequestRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "running",
    app: "MediChain Medical Record Backend",
    version: "2.0.0",
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 MediChain server running on http://localhost:${PORT}`);
});