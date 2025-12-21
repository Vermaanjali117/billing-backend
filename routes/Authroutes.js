const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const adminschema = require("../models/Admin");

const router = express.Router();

// Admin Signup (Only run once, then delete or protect)
router.post("/signup", async (req, res) => {
  console.log("inside signup")
  const { email, password } = req.body;
  const existingAdmin = await adminschema.findOne({ email });
  if (existingAdmin) {
    return res.status(400).json({ message: "Admin already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newAdmin = new adminschema({ email, password: hashedPassword });
  const token = jwt.sign({ id: newAdmin._id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  await newAdmin.save();
  res.cookie("token", token);
  res.status(201).json({
    message: "Admin created successfully",
    data: newAdmin,
  });
});

// Admin Login
router.post("/login", async (req,res)=>{
  const { email, password } = req.body;
  const admin = await adminschema.findOne({ email });
  if (!admin) return res.status(401).json({ message: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
   const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
 res.cookie('token', token, {
  httpOnly: true,
 httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000,
});
  res.json({ message: "loggedIn successfully", admin });
});

module.exports = router;
