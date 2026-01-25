const express = require("express");
const router = express.Router();
const RawMaterial = require("../models/RowMaterial");
const InventoryHistory = require("../models/InventoryHistory");
const authMiddleware = require("../middleware/Authmiddleware");
const mongoose = require("mongoose");
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { name, unit, quantity, alertAt } = req.body;
    // 🔍 check duplicate name in same branch
    const existingMaterial = await RawMaterial.findOne({
      name: name.trim(),
      branchId: req.branchId,
    });

    if (existingMaterial) {
      return res.status(400).json({
        status: "error",
        message: "Raw material with this name already exists",
      });
    }

    const material = await RawMaterial.create({
      name,
      unit,
      quantity,
      alertAt,
      branchId: req.branchId,
    });

    res.status(201).json({
      message: "Raw material added successfully",
      material,
      status: "success",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to add raw material" });
  }
});

router.get("/get-row-material-list", authMiddleware, async (req, res) => {
  try {
    const materials = await RawMaterial.find({
      branchId: req.branchId,
    }).sort({ name: 1 });

    res.json({
      status: "success",
      materials,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch raw materials" });
  }
});

router.patch("/update/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await RawMaterial.findOneAndUpdate(
      {
        _id: req.params.id,
        branchId: req.branchId, // 🔥 ownership check
      },
      req.body,
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    res.json({
      message: "Raw material updated",
      updated,
    });
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await RawMaterial.findOneAndDelete({
      _id: req.params.id,
      branchId: req.branchId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    res.json({
      message: "Raw material deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

router.get("/low-stock", authMiddleware, async (req, res) => {
  try {
    const lowStockMaterials = await RawMaterial.find({
      branchId: req.branchId,
      $expr: { $lte: ["$quantity", "$alertAt"] },
    }).sort({ quantity: 1 });

    res.json({
      status: "success",
      count: lowStockMaterials.length,
      materials: lowStockMaterials,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch low stock materials" });
  }
});

router.get("/inventory", authMiddleware, async (req, res) => {
  try {
    // 1️⃣ get all raw materials stock
    const materials = await RawMaterial.find({
      branchId: req.branchId,
    }).select("quantity");

    const materialMap = {};
    materials.forEach((m) => {
      materialMap[m._id.toString()] = m.quantity;
    });

    // 2️⃣ get inventory history
    const history = await InventoryHistory.find({
      branchId: req.branchId,
    })
      .populate("rawMaterialId", "name unit")
      .populate("createdBy", "email")
      .sort({ createdAt: -1 });

    // 3️⃣ attach remaining quantity
    const finalHistory = history.map((h) => {
      const matId = h.rawMaterialId?._id?.toString();

      return {
        ...h.toObject(),
        remainingQuantity: materialMap[matId] ?? 0,
      };
    });

    res.json({
      status: "success",
      count: finalHistory.length,
      history: finalHistory,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch inventory history" });
  }
});

router.post("/add-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, quantity } = req.body;

    if (!materialId || quantity <= 0) {
      return res.status(400).json({ message: "Invalid input" });
    }

    // 1️⃣ Update raw material quantity
    const updatedMaterial = await RawMaterial.findOneAndUpdate(
      {
        _id: materialId,
        branchId: req.branchId,
      },
      {
        $inc: { quantity: quantity }, // 🔥 APPEND STOCK
      },
      { new: true },
    );

    if (!updatedMaterial) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    // 2️⃣ CREATE INVENTORY HISTORY ENTRY (🔥 THIS WAS MISSING)
    await InventoryHistory.create({
      rawMaterialId: materialId,
      change: quantity, // +100
      reason: "RESTOCK",
      note: "Manual stock addition",
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.json({
      message: "Stock added successfully",
      material: updatedMaterial,
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add stock" });
  }
});

router.post("/adjust-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, newQuantity, note } = req.body;

    if (!materialId || newQuantity < 0) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const material = await RawMaterial.findOne({
      _id: materialId,
      branchId: req.branchId,
    });

    if (!material) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    const difference = newQuantity - material.quantity;

    // 1️⃣ Update stock using $inc
    material.quantity = newQuantity;
    await material.save();

    // 2️⃣ Create inventory history
    await InventoryHistory.create({
      rawMaterialId: material._id,
      change: difference,
      reason: "ADJUSTMENT",
      note: note || "Manual stock adjustment",
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.json({
      message: "Stock adjusted successfully",
      material,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to adjust stock" });
  }
});
// 🔥 DELETE MULTIPLE INVENTORY HISTORY ENTRIES
router.delete("/inventory/bulk-delete", authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        message: "No record IDs provided",
      });
    }

    const result = await InventoryHistory.deleteMany({
      _id: { $in: ids },
      branchId: req.branchId, // 🔒 branch protection
    });

    res.json({
      status: "success",
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} records deleted successfully`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to delete inventory history",
    });
  }
});
// 🔥 DELETE INVENTORY HISTORY BY DATE RANGE
router.delete("/inventory/delete-range", authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        message: "from and to dates are required",
      });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const result = await InventoryHistory.deleteMany({
      branchId: req.branchId,
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    });

    res.json({
      status: "success",
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} inventory records`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to delete inventory history",
    });
  }
});
// 📊 RAW MATERIAL CONSUMPTION SUMMARY
router.get(
  "/inventory/consumption-summary",
  authMiddleware,
  async (req, res) => {
    try {
      const { from, to } = req.query;

      const match = {
        branchId: new mongoose.Types.ObjectId(req.branchId),
        reason: "ORDER",
      };

      // optional date filter
      if (from && to) {
        match.createdAt = {
          $gte: new Date(from),
          $lte: new Date(to + "T23:59:59.999Z"),
        };
      }

      const summary = await InventoryHistory.aggregate([
        { $match: match },

        {
          $group: {
            _id: "$rawMaterialId",
            totalUsed: { $sum: { $abs: "$change" } },
            usageCount: { $sum: 1 },
          },
        },

        {
          $lookup: {
            from: "rawmaterials",
            localField: "_id",
            foreignField: "_id",
            as: "material",
          },
        },

        { $unwind: "$material" },

        {
          $project: {
            _id: 0,
            rawMaterialId: "$_id",
            name: "$material.name",
            unit: "$material.unit",
            totalUsed: 1,
            usageCount: 1,
          },
        },

        { $sort: { totalUsed: -1 } },
      ]);

      res.json({
        status: "success",
        summary,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        message: "Failed to generate consumption summary",
      });
    }
  },
);

module.exports = router;
