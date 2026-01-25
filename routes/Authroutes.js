const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const adminschema = require("../models/Admin");
const Branch = require("../models/Branch");

const router = express.Router();

// Admin Signup (Only run once, then delete or protect)
router.post("/signup", async (req, res) => {
  console.log("inside signup");
  const { email, password, pincode } = req.body;
  const existingAdmin = await adminschema.findOne({ email });
  if (existingAdmin) {
    return res.status(400).json({ message: "Admin already exists" });
  }
  // 2️⃣ find branch using PINCODE
  const branch = await Branch.findOne({ pincode });
  if (!branch) {
    return res.status(400).json({ message: "Invalid pincode" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newAdmin = new adminschema({
    email,
    password: hashedPassword,
    branchId: branch._id,
  });

  const token = jwt.sign({ id: newAdmin._id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  await newAdmin.save();
  res.cookie("token", token);
  res.status(201).json({
    message: "Admin created successfully",
  });
});

// Admin Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Find admin
    const admin = await adminschema.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 2️⃣ Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3️⃣ Create JWT (branch-aware)
    const token = jwt.sign(
      {
        userId: admin._id, // 🔥 consistent key
        branchId: admin.branchId, // 🔥 used everywhere
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 4️⃣ Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // true in prod (https)
      sameSite: "none", // frontend on different domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // 5️⃣ Send SAFE response (no password)
    res.json({
      message: "Logged in successfully",
      admin: {
        id: admin._id,
        email: admin.email,
        branchId: admin.branchId,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed" });
  }
});
router.post("/logout", (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === "production";

    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd, // ✅ true only on HTTPS
      sameSite: isProd ? "none" : "lax",
      path: "/", // ✅ VERY IMPORTANT
    });

    return res.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
