const jwt = require("jsonwebtoken");

const authMiddleware = async (req, res, next) => {
  try {

    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ message: "Please login" });
      
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 Attach values cleanly
    req.userId = decoded.userId;
    req.branchId = decoded.branchId;

    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
