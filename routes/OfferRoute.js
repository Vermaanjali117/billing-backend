const express = require("express");
const router = express.Router();
const Offer = require("../models/Offer");
const authMiddleware = require("../middleware/Authmiddleware");

// ─────────────────────────────────────────────
// POST /offers/create
// Create a new custom offer for this branch
// ─────────────────────────────────────────────
router.post("/createOffer", authMiddleware, async (req, res) => {
  try {
    const { name, description, discountType, discountValue } = req.body;

    if (!name || !discountType || discountValue === undefined) {
      return res.status(400).json({
        status: "error",
        message: "name, discountType, and discountValue are required",
      });
    }

    if (!["PERCENT", "FLAT"].includes(discountType)) {
      return res.status(400).json({
        status: "error",
        message: "discountType must be PERCENT or FLAT",
      });
    }

    if (
      discountType === "PERCENT" &&
      (discountValue <= 0 || discountValue > 100)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Percent discount must be between 1 and 100",
      });
    }

    if (discountType === "FLAT" && discountValue <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Flat discount must be greater than 0",
      });
    }

    const offer = await Offer.create({
      name: name.trim(),
      description: description?.trim() || "",
      discountType,
      discountValue: Number(discountValue),
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.status(201).json({
      status: "success",
      message: "Offer created successfully",
      offer,
    });
  } catch (err) {
    console.error("CREATE OFFER ERROR:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// GET /offers/list
// Get all offers for this branch (active + inactive)
// ─────────────────────────────────────────────
router.get("/offerlist", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.find({ branchId: req.branchId }).sort({
      createdAt: -1,
    });

    res.json({
      status: "success",
      count: offers.length,
      offers,
    });
  } catch (err) {
    console.error("LIST OFFERS ERROR:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to fetch offers" });
  }
});

// ─────────────────────────────────────────────
// GET /offers/active
// Get only active offers (used by POS billing screen)
// ─────────────────────────────────────────────
router.get("/activeoffer", authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.find({
      branchId: req.branchId,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      status: "success",
      count: offers.length,
      offers,
    });
  } catch (err) {
    console.error("ACTIVE OFFERS ERROR:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to fetch active offers" });
  }
});

// ─────────────────────────────────────────────
// PATCH /offers/:id/toggle
// Enable or disable an offer
// ─────────────────────────────────────────────
router.patch("/:id/toggle", authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.id,
      branchId: req.branchId,
    });

    if (!offer) {
      return res.status(404).json({
        status: "error",
        message: "Offer not found",
      });
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({
      status: "success",
      message: `Offer ${offer.isActive ? "enabled" : "disabled"} successfully`,
      offer,
    });
  } catch (err) {
    console.error("TOGGLE OFFER ERROR:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// PATCH /offers/:id/edit
// Edit an existing offer's details
// ─────────────────────────────────────────────
router.patch("/:id/edit", authMiddleware, async (req, res) => {
  try {
    const { name, description, discountType, discountValue } = req.body;

    const offer = await Offer.findOne({
      _id: req.params.id,
      branchId: req.branchId,
    });

    if (!offer) {
      return res.status(404).json({
        status: "error",
        message: "Offer not found",
      });
    }

    if (name) offer.name = name.trim();
    if (description !== undefined) offer.description = description.trim();
    if (discountType) offer.discountType = discountType;
    if (discountValue !== undefined)
      offer.discountValue = Number(discountValue);

    await offer.save();

    res.json({
      status: "success",
      message: "Offer updated successfully",
      offer,
    });
  } catch (err) {
    console.error("EDIT OFFER ERROR:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// DELETE /offers/:id
// Permanently delete an offer
// ─────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await Offer.findOneAndDelete({
      _id: req.params.id,
      branchId: req.branchId,
    });

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Offer not found",
      });
    }

    res.json({
      status: "success",
      message: "Offer deleted successfully",
    });
  } catch (err) {
    console.error("DELETE OFFER ERROR:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = router;
