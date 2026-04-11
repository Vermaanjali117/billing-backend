const express = require("express");
const router = express.Router();
const RawMaterial = require("../models/RowMaterial");
const BranchStock = require("../models/BranchStock");
const convertToBaseUnit = require("../utils/unitconverter");
const InventoryHistory = require("../models/InventoryHistory");
const authMiddleware = require("../middleware/Authmiddleware");
const mongoose = require("mongoose");

// ============================================================
// UNIT SYSTEM — READ THIS FIRST
// ============================================================
// ALL quantities in BranchStock are stored in BASE UNITS:
//   kg  → stored as gm  (×1000)   e.g. 20 kg  → 20000 gm
//   ltr → stored as ml  (×1000)   e.g. 5 ltr  → 5000  ml
//   gm  → stored as gm  (×1)
//   ml  → stored as ml  (×1)
//   pcs → stored as pcs (×1)
//
// The frontend always DISPLAYS in the material's native unit.
// Use toDisplayUnit() before sending stock to frontend.
// Use convertToBaseUnit() before writing stock to DB.
//
// Recipe materials (Recipe.js) are also stored in base units
// (RecipeRoute save() converts them). So Orders.js can deduct
// directly without any conversion.
// ============================================================

function toDisplayUnit(baseQty, unit) {
  const u = (unit || "").toLowerCase().trim();
  if (u === "kg") return +(baseQty / 1000).toFixed(4);
  if (u === "ltr") return +(baseQty / 1000).toFixed(4);
  return baseQty;
}

// Convert unit label to its base: kg→gm, ltr→ml, others unchanged
function toBaseUnitLabel(unit) {
  const u = (unit || "").toLowerCase().trim();
  if (u === "kg") return "gm";
  if (u === "ltr") return "ml";
  return u;
}

// Normalize ingredients: convert quantityRequired to base units AND fix unit label
// e.g. { quantityRequired: 1, unit: "kg" } → { quantityRequired: 1000, unit: "gm" }
function normalizeIngredients(ingredients) {
  if (!ingredients || !Array.isArray(ingredients)) return [];
  return ingredients.map((ing) => ({
    rawMaterialId: ing.rawMaterialId,
    quantityRequired: convertToBaseUnit(Number(ing.quantityRequired), ing.unit),
    unit: toBaseUnitLabel(ing.unit),
  }));
}

// ─── ADD RAW MATERIAL / COMPOSITE ─────────────────────────────
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const {
      name,
      unit,
      quantity,
      alertAt,
      type,
      ingredients,
      yieldQuantity, // ✅ NEW
      yieldUnit, // ✅ NEW
    } = req.body;

    // ✅ Basic validation
    if (!name || !unit) {
      return res.status(400).json({
        status: "error",
        message: "Name and unit are required",
      });
    }

    // ✅ Composite validation
    if (type === "COMPOSITE") {
      if (!yieldQuantity || Number(yieldQuantity) <= 0) {
        return res.status(400).json({
          status: "error",
          message: "Yield quantity is required for composite items",
        });
      }

      if (!ingredients || !ingredients.length) {
        return res.status(400).json({
          status: "error",
          message: "Ingredients are required for composite items",
        });
      }
    }

    // 🔍 Debug (remove later)
    console.log("BODY:", req.body);

    // 🔍 Check existing material
    let material = await RawMaterial.findOne({ name: name.trim() });

    if (!material) {
      material = await RawMaterial.create({
        name: name.trim(),
        unit,

        // ✅ Always store alert in base unit
        alertAt: alertAt ? convertToBaseUnit(Number(alertAt), unit) : 0,

        type: type || "RAW",

        // ✅ Ingredients for composite
        ingredients:
          type === "COMPOSITE" ? normalizeIngredients(ingredients) : [],

        // ✅ NEW: Yield logic (core fix)
        yieldQuantity: type === "COMPOSITE" ? Number(yieldQuantity) : 0,

        yieldUnit:
          type === "COMPOSITE"
            ? yieldUnit || "UNIT" // 🔥 default to UNIT (pieces)
            : unit,
      });
    }

    // ✅ Convert initial quantity to base unit
    const baseQty = convertToBaseUnit(Number(quantity) || 0, unit);

    // ✅ Insert into BranchStock if not exists
    await BranchStock.updateOne(
      {
        branchId: req.branchId,
        rawMaterialId: material._id,
      },
      {
        $setOnInsert: { quantity: baseQty },
      },
      { upsert: true },
    );

    return res.status(201).json({
      status: "success",
      material,
    });
  } catch (err) {
    console.error("ADD MATERIAL ERROR:", err);

    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
});
// ─── BATCH PREVIEW ────────────────────────────────────────────
// Returns what 1 batch will consume and produce — no stock changes.
router.get("/batch-preview/:premixId", authMiddleware, async (req, res) => {
  try {
    const material = await RawMaterial.findById(req.params.premixId).populate(
      "ingredients.rawMaterialId",
      "name unit",
    );

    if (!material || material.type !== "COMPOSITE") {
      return res.status(404).json({ message: "Composite material not found" });
    }
    if (!material.yieldQuantity || material.yieldQuantity <= 0) {
      return res.status(400).json({
        message: `Batch yield not set for ${material.name}. Edit the material and set the yield quantity.`,
      });
    }

    const ingredientList = material.ingredients.map((item) => {
      const mat = item.rawMaterialId;
      return {
        name: mat?.name || "Unknown",
        required: item.quantityRequired,
        unit: item.unit, // already base unit (gm/ml)
      };
    });

    res.json({
      status: "success",
      preview: {
        materialName: material.name,
        ingredients: ingredientList,
        yieldQuantity: material.yieldQuantity,
        yieldUnit: material.yieldUnit || material.unit,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load batch preview" });
  }
});

// ─── PRODUCE COMPOSITE ───────────────────────────────────────
// Always 1 fixed batch. Deducts ingredients, adds yieldQuantity to stock.
// Frontend sends only { premixId } — no qty input needed.
router.post("/produce-composite", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { premixId } = req.body;
    if (!premixId) throw new Error("premixId is required");

    const premixObjectId = new mongoose.Types.ObjectId(premixId);
    const compositeMaterial =
      await RawMaterial.findById(premixObjectId).session(session);

    if (!compositeMaterial || compositeMaterial.type !== "COMPOSITE") {
      throw new Error("Composite material not found");
    }
    if (
      !compositeMaterial.ingredients ||
      compositeMaterial.ingredients.length === 0
    ) {
      throw new Error("No ingredients defined for this composite material");
    }

    const yieldQty = compositeMaterial.yieldQuantity;
    const yieldUnit = compositeMaterial.yieldUnit || compositeMaterial.unit;

    if (!yieldQty || yieldQty <= 0) {
      throw new Error(
        `Batch yield not defined for ${compositeMaterial.name}. Please edit the material and set the yield quantity.`,
      );
    }

    // Build deduction map — quantityRequired already in base units (gm/ml)
    const materialMap = {};
    for (const item of compositeMaterial.ingredients) {
      const id = item.rawMaterialId.toString();
      materialMap[id] = (materialMap[id] || 0) + item.quantityRequired;
    }

    // Validate stock
    for (const materialId in materialMap) {
      const objectId = new mongoose.Types.ObjectId(materialId);
      const stock = await BranchStock.findOne({
        branchId: req.branchId,
        rawMaterialId: objectId,
      }).session(session);
      const material = await RawMaterial.findById(objectId).session(session);
      if (!material) throw new Error("Ingredient material not found");

      const available = stock ? stock.quantity : 0;
      const required = materialMap[materialId];
      if (available < required) {
        throw new Error(
          `Insufficient stock for ${material.name}. Need ${toDisplayUnit(required, material.unit)} ${material.unit}, have ${toDisplayUnit(available, material.unit)} ${material.unit}`,
        );
      }
    }

    // Deduct all ingredients
    for (const materialId in materialMap) {
      const objectId = new mongoose.Types.ObjectId(materialId);
      const result = await BranchStock.updateOne(
        { branchId: req.branchId, rawMaterialId: objectId },
        { $inc: { quantity: -materialMap[materialId] } },
        { session },
      );
      if (result.matchedCount === 0)
        throw new Error("Stock entry not found for ingredient");

      await InventoryHistory.create(
        [
          {
            rawMaterialId: materialId,
            change: -materialMap[materialId],
            reason: "RESTOCK",
            branchId: req.branchId,
            createdBy: req.userId,
          },
        ],
        { session },
      );
    }

    // Add yield to composite stock
    const yieldInBase = convertToBaseUnit(yieldQty, yieldUnit);
    await BranchStock.updateOne(
      { branchId: req.branchId, rawMaterialId: premixObjectId },
      { $inc: { quantity: yieldInBase } },
      { upsert: true, session },
    );

    await InventoryHistory.create(
      [
        {
          rawMaterialId: premixObjectId.toString(),
          change: yieldInBase,
          reason: "RESTOCK",
          branchId: req.branchId,
          createdBy: req.userId,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.json({
      status: "success",
      message: `1 batch produced: added ${yieldQty} ${yieldUnit} of ${compositeMaterial.name} to stock`,
      yieldQuantity: yieldQty,
      yieldUnit,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("PRODUCTION ERROR:", err);
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    session.endSession();
  }
});

// ─── GET MATERIAL LIST (with stock in display units) ─────────
router.get("/get-row-material-list", authMiddleware, async (req, res) => {
  try {
    const materials = await RawMaterial.find().sort({ name: 1 });
    const stocks = await BranchStock.find({ branchId: req.branchId });

    const stockMap = {};
    stocks.forEach((s) => {
      stockMap[s.rawMaterialId.toString()] = s.quantity; // base units
    });

    const result = materials.map((m) => {
      const baseQty = stockMap[m._id.toString()] || 0;
      return {
        ...m.toObject(),
        quantity: toDisplayUnit(baseQty, m.unit), // convert for display
        quantityBase: baseQty, // raw base value (optional, useful for frontend math)
        // Also convert alertAt for display
        alertAt: toDisplayUnit(m.alertAt || 0, m.unit),
      };
    });

    res.json({ status: "success", materials: result });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch materials" });
  }
});

// ─── UPDATE MATERIAL ─────────────────────────────────────────
router.patch("/update/:id", authMiddleware, async (req, res) => {
  try {
    const materialId = req.params.id;
    const { unit, name, ingredients, type, alertAt, yieldQuantity, yieldUnit } =
      req.body;

    const existing = await RawMaterial.findById(materialId).select("unit");
    const effectiveUnit = unit || existing?.unit;

    const updateFields = {};

    if (name) updateFields.name = name;
    if (unit) updateFields.unit = unit;

    if (alertAt !== undefined) {
      updateFields.alertAt = convertToBaseUnit(Number(alertAt), effectiveUnit);
    }

    if (type) updateFields.type = type;

    // ✅ COMPOSITE LOGIC
    if (type === "COMPOSITE" || (!type && ingredients)) {
      if (ingredients) {
        updateFields.ingredients = normalizeIngredients(ingredients);
      }

      if (yieldQuantity !== undefined) {
        updateFields.yieldQuantity = Number(yieldQuantity);
      }

      if (yieldUnit) {
        updateFields.yieldUnit = yieldUnit || "UNIT";
      }
    }

    await RawMaterial.updateOne({ _id: materialId }, { $set: updateFields });

    res.json({
      status: "success",
      message: "Material updated successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Update failed",
      error: err.message,
    });
  }
});

// ─── DELETE MATERIAL ─────────────────────────────────────────
router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await RawMaterial.findOneAndDelete({ _id: req.params.id });
    if (!deleted)
      return res.status(404).json({ message: "Raw material not found" });

    await BranchStock.deleteMany({ rawMaterialId: req.params.id });

    res.json({
      message: "Raw material and associated stock deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// ─── LOW STOCK ALERT ─────────────────────────────────────────
router.get("/low-stock", authMiddleware, async (req, res) => {
  try {
    // Join BranchStock with RawMaterial to compare quantity vs alertAt
    const stocks = await BranchStock.find({ branchId: req.branchId }).populate(
      "rawMaterialId",
    );

    const lowStock = stocks
      .filter((s) => {
        const mat = s.rawMaterialId;
        return mat && s.quantity <= (mat.alertAt || 0);
      })
      .map((s) => {
        const mat = s.rawMaterialId;
        return {
          _id: mat._id,
          name: mat.name,
          unit: mat.unit,
          quantity: toDisplayUnit(s.quantity, mat.unit),
          alertAt: toDisplayUnit(mat.alertAt || 0, mat.unit),
        };
      })
      .sort((a, b) => a.quantity - b.quantity);

    res.json({
      status: "success",
      count: lowStock.length,
      materials: lowStock,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch low stock materials" });
  }
});

// ─── INVENTORY HISTORY ───────────────────────────────────────
router.get("/inventory", authMiddleware, async (req, res) => {
  try {
    // Get current stock from BranchStock (correct model, not RawMaterial)
    const stocks = await BranchStock.find({ branchId: req.branchId });
    const stockMap = {};
    stocks.forEach((s) => {
      stockMap[s.rawMaterialId.toString()] = s.quantity;
    });

    const history = await InventoryHistory.find({ branchId: req.branchId })
      .populate("rawMaterialId", "name unit")
      .populate("createdBy", "email")
      .sort({ createdAt: -1 });

    const finalHistory = history.map((h) => {
      const mat = h.rawMaterialId;
      const matId = mat?._id?.toString();
      const baseStock = stockMap[matId] ?? 0;
      return {
        ...h.toObject(),
        // Show change and remaining in display units for readability
        changeDisplay: toDisplayUnit(Math.abs(h.change), mat?.unit),
        remainingQuantity: toDisplayUnit(baseStock, mat?.unit),
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

// ─── ADD STOCK (restock) ──────────────────────────────────────
router.post("/add-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, quantity } = req.body;

    if (!materialId || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid material ID or quantity" });
    }

    const material = await RawMaterial.findById(materialId);
    if (!material)
      return res.status(404).json({ message: "Raw material not found" });

    // User types in display units (e.g. 5 kg) → convert to base units (5000 gm)
    const baseQty = convertToBaseUnit(Number(quantity), material.unit);

    const updatedStock = await BranchStock.findOneAndUpdate(
      { rawMaterialId: materialId, branchId: req.branchId },
      { $inc: { quantity: baseQty } },
      { new: true, upsert: true },
    );

    await InventoryHistory.create({
      rawMaterialId: materialId,
      change: baseQty,
      reason: "RESTOCK",
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.json({
      status: "success",
      message: `Added ${quantity} ${material.unit} to ${material.name}`,
      currentStock: toDisplayUnit(updatedStock.quantity, material.unit),
      currentStockUnit: material.unit,
    });
  } catch (err) {
    console.error("ADD STOCK ERROR:", err);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
});

// ─── ADJUST STOCK (set to exact value) ───────────────────────
router.post("/adjust-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, newQuantity, note } = req.body;

    if (!materialId || newQuantity < 0) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const material = await RawMaterial.findById(materialId).select("unit name");
    if (!material)
      return res.status(404).json({ message: "Raw material not found" });

    const branchStock = await BranchStock.findOne({
      branchId: req.branchId,
      rawMaterialId: materialId,
    });
    if (!branchStock)
      return res.status(404).json({ message: "Stock record not found" });

    // User types in display units → convert to base units
    const newBaseQty = convertToBaseUnit(Number(newQuantity), material.unit);
    const difference = newBaseQty - branchStock.quantity; // both in base units

    branchStock.quantity = newBaseQty;
    await branchStock.save();

    await InventoryHistory.create({
      rawMaterialId: materialId, // ← correct: materialId from req.body
      change: difference,
      reason: "ADJUSTMENT",
      branchId: req.branchId,
      createdBy: req.userId,
    });

    res.json({
      message: "Stock adjusted successfully",
      currentStock: toDisplayUnit(newBaseQty, material.unit),
      currentStockUnit: material.unit,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to adjust stock" });
  }
});

// ─── BULK DELETE INVENTORY HISTORY ───────────────────────────
router.delete("/inventory/bulk-delete", authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No record IDs provided" });
    }

    const result = await InventoryHistory.deleteMany({
      _id: { $in: ids },
      branchId: req.branchId,
    });

    res.json({
      status: "success",
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} records deleted successfully`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete inventory history" });
  }
});

// ─── DELETE INVENTORY HISTORY BY DATE RANGE ──────────────────
router.delete("/inventory/delete-range", authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to)
      return res
        .status(400)
        .json({ message: "from and to dates are required" });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const result = await InventoryHistory.deleteMany({
      branchId: req.branchId,
      createdAt: { $gte: fromDate, $lte: toDate },
    });

    res.json({
      status: "success",
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} inventory records`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete inventory history" });
  }
});

// ─── CONSUMPTION SUMMARY ─────────────────────────────────────
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
            totalUsedBase: { $sum: { $abs: "$change" } },
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
            totalUsedBase: 1,
            usageCount: 1,
          },
        },
        { $sort: { totalUsedBase: -1 } },
      ]);

      // Convert base units back to display units for frontend
      const displaySummary = summary.map((s) => ({
        ...s,
        totalUsed: toDisplayUnit(s.totalUsedBase, s.unit),
      }));

      res.json({ status: "success", summary: displaySummary });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: "Failed to generate consumption summary" });
    }
  },
);

module.exports = router;
