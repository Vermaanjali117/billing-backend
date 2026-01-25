// server.js
require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const http = require("http");
const path = require("path");
const cors = require("cors");

const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app);

// ---- CORS: allow Angular dev server (localhost:4200) ----
app.use(
  cors({
    origin: [process.env.CORS_ORIGIN, "http://localhost:4200"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ---- middlewares ----

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.url}`);
  next();
});

// ---- routes ----
const router = require("./routes/Authroutes"); // auth routes (login/register)
const itemrouter = require("./routes/Items");
const Orderrouter = require("./routes/Orders");
const authMiddleware = require("./middleware/Authmiddleware");
const rowMaterialRouter = require("./routes/RowMaterialRoute");
const RecipeRouter = require("./routes/RecipeRoute");
const CustomerRouter = require("./routes/CustomerRouter");
// Public auth routes (no auth middleware)
app.use("/api/auth", router);

// Protected routes
app.use("/api/items", authMiddleware, itemrouter);
app.use("/api/orders", authMiddleware, Orderrouter);
app.use("/api/raw-materials", authMiddleware,rowMaterialRouter);
app.use("/api/recipe", authMiddleware,RecipeRouter);
app.use("/api/customer", authMiddleware,CustomerRouter);
// Optional health-check
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// ---- start server after DB connect ----
const PORT = process.env.PORT || 3000;
connectDB()
  .then(() => {
    console.log("Database connected successfully");
    server.listen(PORT, () => {
      console.log(`API server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed", err);
    // process.exit(1);
  });
