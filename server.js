require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const http = require("http");
const path = require("path");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app);

// ---- middlewares ----
app.use(express.json());
app.use(cookieParser());

// serve uploads if needed
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  cors({
    origin: "http://localhost:4200",
    credentials: true,
  }),
);
// simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.url}`);
  next();
});

// ---- API routes ----
const router = require("./routes/Authroutes");
const itemrouter = require("./routes/Items");
const Orderrouter = require("./routes/Orders");
const authMiddleware = require("./middleware/Authmiddleware");
const rowMaterialRouter = require("./routes/RowMaterialRoute");
const RecipeRouter = require("./routes/RecipeRoute");
const CustomerRouter = require("./routes/CustomerRouter");

// Public auth routes
app.use("/api/auth", router);

// Protected routes
app.use("/api/items", authMiddleware, itemrouter);
app.use("/api/orders", authMiddleware, Orderrouter);
app.use("/api/raw-materials", authMiddleware, rowMaterialRouter);
app.use("/api/recipe", authMiddleware, RecipeRouter);
app.use("/api/customer", authMiddleware, CustomerRouter);

// Health check
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() }),
);

// =============================
// SERVE ANGULAR FRONTEND
// =============================
// Serve Angular
app.use(express.static(path.join(__dirname, "public")));

// Angular fallback route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- start server ----
const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    console.log("Database connected successfully");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed", err);
  });
