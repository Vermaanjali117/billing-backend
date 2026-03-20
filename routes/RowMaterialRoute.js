const express = require("express");
const router = express.Router();
const RawMaterial = require("../models/RowMaterial");
const BranchStock = require("../models/BranchStock");
const convertToBaseUnit = require("../utils/unitconverter");
const InventoryHistory = require("../models/InventoryHistory");
const authMiddleware = require("../middleware/Authmiddleware");
const mongoose = require("mongoose");
//  add comment
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { name, unit, quantity, alertAt, type, ingredients } = req.body;

    if (!name || !unit) {
      return res.status(400).json({
        status: "error",
        message: "Name and unit are required",
      });
    }

    // Check if material exists globally
    let material = await RawMaterial.findOne({
      name: name.trim(),
    });

    // If not create global material
    if (!material) {
      material = await RawMaterial.create({
        name: name.trim(),
        unit,
        alertAt: alertAt || 0,
        type: type || "RAW",
        ingredients: type === "COMPOSITE" ? ingredients || [] : [],
      });
    }

    // Create stock for this branch
    await BranchStock.updateOne(
      {
        branchId: req.branchId,
        rawMaterialId: material._id,
      },
      {
        $setOnInsert: {
          quantity: quantity || 0,
        },
      },
      { upsert: true },
    );

    res.status(201).json({
      status: "success",
      material,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/produce-composite", authMiddleware, async (req, res) => {
  try {
    const { premixId, qty } = req.body;

    const compositeMaterial = await RawMaterial.findById(premixId);
    if (!compositeMaterial || compositeMaterial.type !== "COMPOSITE") {
      return res.status(404).json({ message: "Composite material not found" });
    }

    if (
      !compositeMaterial.ingredients ||
      compositeMaterial.ingredients.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "No recipe defined for this composite material" });
    }

    const materialMap = {};
    for (const item of compositeMaterial.ingredients) {
      const totalUsed = item.quantityRequired * qty;
      materialMap[item.rawMaterialId] = totalUsed;
    }

    // 1️⃣ Validate Stock First
    for (const materialId in materialMap) {
      const stock = await BranchStock.findOne({
        branchId: req.branchId,
        rawMaterialId: materialId,
      });

      const material = await RawMaterial.findById(materialId);
      const name = material?.name || "Unknown material";

      let stockInGrams = stock ? stock.quantity : 0;
      // Convert stored KG/Ltr to Grams for comparison
      if (material.unit === "kg" || material.unit === "ltr") {
        stockInGrams = stockInGrams * 1000;
      }

      if (stockInGrams < materialMap[materialId]) {
        throw new Error(
          `Insufficient stock for ${name}. Required: ${materialMap[materialId]}gm, Available: ${stockInGrams}gm`,
        );
      }
    }

    // 2️⃣ Prepare Update Operations
    const updatePromises = Object.keys(materialMap).map(async (materialId) => {
      const material = await RawMaterial.findById(materialId);
      let deductionAmount = materialMap[materialId];

      // Convert Grams back to KG/Ltr for database deduction
      if (material.unit === "kg" || material.unit === "ltr") {
        deductionAmount = deductionAmount / 1000;
      }

      return BranchStock.updateOne(
        { branchId: req.branchId, rawMaterialId: materialId },
        { $inc: { quantity: -deductionAmount } },
      );
    });

    // 3️⃣ Add the Premix increase to the same promise array
    updatePromises.push(
      BranchStock.updateOne(
        { branchId: req.branchId, rawMaterialId: premixId },
        { $inc: { quantity: qty } },
        { upsert: true },
      ),
    );

    // 4️⃣ Execute all updates together
    await Promise.all(updatePromises);

    res.json({
      status: "success",
      message: `${qty} ${compositeMaterial.unit} of ${compositeMaterial.name} produced successfully`,
    });
  } catch (err) {
    console.error("PRODUCE ERROR:", err);
    res.status(400).json({ message: err.message });
  }
});
router.get("/get-row-material-list", authMiddleware, async (req, res) => {
  try {
    const materials = await RawMaterial.find().sort({ name: 1 });

    const stocks = await BranchStock.find({
      branchId: req.branchId,
    });

    const stockMap = {};

    stocks.forEach((s) => {
      stockMap[s.rawMaterialId.toString()] = s.quantity;
    });

    const result = materials.map((m) => ({
      ...m.toObject(),
      quantity: stockMap[m._id.toString()] || 0,
    }));

    res.json({
      status: "success",
      materials: result,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch materials" });
  }
});

router.patch("/update/:id", authMiddleware, async (req, res) => {
  try {
    const materialId = req.params.id; // This is the RawMaterial ObjectId
    const { quantity, unit } = req.body;

    // 1. Update the Quantity in BranchStock
    const stockUpdate = await BranchStock.updateOne(
      {
        branchId: req.branchId,
        rawMaterialId: materialId,
      },
      {
        $set: { quantity: Number(quantity) }, // Ensure it's a number
      },
    );

    // 2. Update the Unit in RawMaterial (since it's common for all branches)
    if (unit) {
      await RawMaterial.updateOne(
        { _id: materialId },
        { $set: { unit: unit } },
      );
    }

    if (stockUpdate.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "Raw material stock record not found" });
    }

    res.json({
      message: "Stock and Global Unit updated successfully",
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    // 1. First, find and delete the raw material definition
    const deleted = await RawMaterial.findOneAndDelete({
      _id: req.params.id,
      // branchId: req.branchId, // REMOVE THIS if branchId is not in RawMaterial schema
    });

    if (!deleted) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    // 2. IMPORTANT: Delete the associated stock for all branches
    // or specifically for this branch in the BranchStock collection
    await BranchStock.deleteMany({ rawMaterialId: req.params.id });

    res.json({
      message: "Raw material and associated stock deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed", error: err.message });
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

    if (!materialId || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid material ID or quantity" });
    }

    // 1️⃣ Fetch the material to get its unit (kg/ltr/gm)
    const material = await RawMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: "Raw material not found" });
    }

    // 2️⃣ Handle Conversion Logic
    // If user enters 5 (kg), we store it as 5. The baseQty logic is only
    // needed if your frontend sends grams but your DB stores KG.
    // For manual restock, we usually store what the user types.
    let baseQty = Number(quantity);

    // 3️⃣ Update BranchStock (Not RawMaterial directly)
    // Based on your system design, stock levels live in BranchStock
    const updatedStock = await BranchStock.findOneAndUpdate(
      {
        rawMaterialId: materialId,
        branchId: req.branchId,
      },
      {
        $inc: { quantity: baseQty },
      },
      { new: true, upsert: true }, // Upsert creates the record if it doesn't exist
    );

    // 4️⃣ Create Inventory History Entry
    await InventoryHistory.create({
      rawMaterialId: materialId,
      change: baseQty,
      reason: "RESTOCK",
      note: "Manual stock addition",
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.json({
      status: "success",
      message: `Successfully added ${baseQty} ${material.unit} to ${material.name}`,
      currentStock: updatedStock.quantity,
    });
  } catch (err) {
    console.error("ADD STOCK ERROR:", err);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
});

router.post("/adjust-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, newQuantity, note } = req.body;

    if (!materialId || newQuantity < 0) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const material = await BranchStock.findOne({
      branchId: req.branchId,
      rawMaterialId: materialId,
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
