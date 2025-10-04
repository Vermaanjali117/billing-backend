require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
const http = require("http");
const server = http.createServer(app);
const connectDB = require("./config/db");
const cors = require("cors");
const path = require("path");
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(cookieParser());
app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  next();
});

const router = require("./routes/Authroutes");
const itemrouter = require("./routes/Items");
const Orderrouter = require("./routes/Orders");


const authMiddleware = require("./middleware/Authmiddleware.js");

app.use("/api/auth", router);
app.use("/api/items", authMiddleware, itemrouter);
app.use("/api/orders", authMiddleware, Orderrouter);
app.use(express.static(path.join(__dirname, '../CAFEPOSFRONTEND/dist/possystem')));
console.log("Serving Angular from:", path.join(__dirname, '../CAFEPOSFRONTEND/dist/possystem'));
// 👆 replace `frontend/dist/possystem` with your actual Angular dist folder

// ✅ Catch-all to serve Angular's index.html for frontend routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../CAFEPOSFRONTEND/dist/possystem/index.html'));
  console.log("serving path from", path.join(__dirname, '../CAFEPOSFRONTEND/dist/possystem/index.html'))

});

connectDB()
  .then(() => {
    console.log("database connected successfully");
    server.listen(3000, () => {
      console.log("Server is running on port 3000");
    });
  })
  .catch((err) => {
    console.log("database connection failed", err);
  });
