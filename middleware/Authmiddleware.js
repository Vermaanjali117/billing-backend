const jwt = require("jsonwebtoken");

const authMiddleware = async (req, res, next) => {
  try {
      console.log("Cookies received:", req.cookies);
    const { token } = req.cookies;
    if (!token) {
      return res.status(401).send("Please Login");
    }
    var decoded = await jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).send("unauthorized user");
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid Token" });
  }
};

module.exports = authMiddleware;


