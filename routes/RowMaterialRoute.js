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
  if (u === "kg")  return +(baseQty / 1000).toFixed(4);
  if (u === "ltr") return +(baseQty / 1000).toFixed(4);
  return baseQty; // gm, ml, pcs → no conversion
}

// ─── ADD RAW MATERIAL ───────────────────────────────────────
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { name, unit, quantity, alertAt, type, ingredients } = req.body;

    if (!name || !unit) {
      return res.status(400).json({ status: "error", message: "Name and unit are required" });
    }

    let material = await RawMaterial.findOne({ name: name.trim() });

    if (!material) {
      material = await RawMaterial.create({
        name: name.trim(),
        unit,
        alertAt: alertAt ? convertToBaseUnit(Number(alertAt), unit) : 0,
        type: type || "RAW",
        ingredients: type === "COMPOSITE" ? ingredients || [] : [],
      });
    }

    // Convert initial quantity to base units before storing
    const baseQty = convertToBaseUnit(Number(quantity) || 0, unit);

    await BranchStock.updateOne(
      { branchId: req.branchId, rawMaterialId: material._id },
      { $setOnInsert: { quantity: baseQty } },
      { upsert: true },
    );

    res.status(201).json({ status: "success", material });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── PRODUCE COMPOSITE (e.g. make Premix from Flour + Milk + Sugar) ──
router.post("/produce-composite", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { premixId, qty } = req.body;

    if (!premixId || !qty) throw new Error("premixId and qty are required");

    const premixObjectId = new mongoose.Types.ObjectId(premixId);
    const compositeMaterial = await RawMaterial.findById(premixObjectId).session(session);

    if (!compositeMaterial || compositeMaterial.type !== "COMPOSITE") {
      throw new Error("Composite material not found");
    }
    if (!compositeMaterial.ingredients || compositeMaterial.ingredients.length === 0) {
      throw new Error("No ingredients defined for this composite material");
    }

    // qty is what the user typed (e.g. "2" meaning 2 kg of premix)
    // Convert to base units so we can scale the recipe (which is also in base units)
    // Recipe ingredient: 500 gm per 1 kg premix → stored as 500 gm base
    // To make 2 kg premix: need 500 * (2000 / 1000) = 1000 gm = 1 kg flour
    const qtyInBase = convertToBaseUnit(Number(qty), compositeMaterial.unit);

    // Recipe is per 1 base unit of premix output (1 gm of premix)
    // So scale factor = qtyInBase (how many gm of premix we want)
    // But the recipe ingredients are defined per 1 USER unit (e.g. per 1 kg)
    // So scale factor = qty (user value), not qtyInBase
    // e.g. recipe: 500 gm flour per 1 kg premix. Making 2 kg → 500 * 2 = 1000 gm
    const scaleFactor = Number(qty);

    // Build map of materialId → how much base-unit quantity to deduct
    const materialMap = {};
    for (const item of compositeMaterial.ingredients) {
      const materialId = item.rawMaterialId.toString();
      // item.quantityRequired is stored in base units (gm/ml/pcs)
      // item.unit tells us the original unit context (for reference only)
      const required = item.quantityRequired * scaleFactor;
      materialMap[materialId] = (materialMap[materialId] || 0) + required;
    }

    // Validate stock (everything in base units now)
    for (const materialId in materialMap) {
      const objectId = new mongoose.Types.ObjectId(materialId);
      const stock = await BranchStock.findOne({ branchId: req.branchId, rawMaterialId: objectId }).session(session);
      const material = await RawMaterial.findById(objectId).session(session);
      if (!material) throw new Error("Ingredient material not found");

      const available = stock ? stock.quantity : 0;
      const required = materialMap[materialId];

      if (available < required) {
        // Show user-friendly units in error message
        const availDisplay = toDisplayUnit(available, material.unit);
        const reqDisplay = toDisplayUnit(required, material.unit);
        throw new Error(
          `Insufficient stock for ${material.name}. Need ${reqDisplay} ${material.unit}, have ${availDisplay} ${material.unit}`
        );
      }
    }

    // Deduct ingredients from stock
    for (const materialId in materialMap) {
      const objectId = new mongoose.Types.ObjectId(materialId);
      const result = await BranchStock.updateOne(
        { branchId: req.branchId, rawMaterialId: objectId },
        { $inc: { quantity: -materialMap[materialId] } },
        { session },
      );
      if (result.matchedCount === 0) throw new Error(`Stock entry not found for ingredient`);
    }

    // Add produced premix to stock (in base units)
    await BranchStock.updateOne(
      { branchId: req.branchId, rawMaterialId: premixObjectId },
      { $inc: { quantity: qtyInBase } },
      { upsert: true, session },
    );

    await session.commitTransaction();

    res.json({
      status: "success",
      message: `${qty} ${compositeMaterial.unit} of ${compositeMaterial.name} produced successfully`,
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
        quantityBase: baseQty,                     // raw base value (optional, useful for frontend math)
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
    const { quantity, unit, name, ingredients, type, alertAt, outputQuantity, outputUnit } = req.body;

    // Fetch current material to know the unit if not being changed
    const existing = await RawMaterial.findById(materialId).select("unit");
    const effectiveUnit = unit || existing?.unit;

    // Store stock in base units
    if (quantity !== undefined) {
      const baseQty = convertToBaseUnit(Number(quantity), effectiveUnit);
      await BranchStock.updateOne(
        { branchId: req.branchId, rawMaterialId: materialId },
        { $set: { quantity: baseQty } },
      );
    }

    // Prepare RawMaterial field updates
    const updateFields = {};
    if (name) updateFields.name = name;
    if (unit) updateFields.unit = unit;
    if (alertAt !== undefined) updateFields.alertAt = convertToBaseUnit(Number(alertAt), effectiveUnit);
    if (type) updateFields.type = type;

    if (type === "COMPOSITE") {
      if (ingredients) updateFields.ingredients = ingredients;
      if (outputQuantity !== undefined) updateFields.outputQuantity = outputQuantity;
      if (outputUnit) updateFields.outputUnit = outputUnit;
    }

    await RawMaterial.updateOne({ _id: materialId }, { $set: updateFields });

    res.json({ status: "success", message: "Material updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// ─── DELETE MATERIAL ─────────────────────────────────────────
router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await RawMaterial.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Raw material not found" });

    await BranchStock.deleteMany({ rawMaterialId: req.params.id });

    res.json({ message: "Raw material and associated stock deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// ─── LOW STOCK ALERT ─────────────────────────────────────────
router.get("/low-stock", authMiddleware, async (req, res) => {
  try {
    // Join BranchStock with RawMaterial to compare quantity vs alertAt
    const stocks = await BranchStock.find({ branchId: req.branchId })
      .populate("rawMaterialId");

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

    res.json({ status: "success", count: lowStock.length, materials: lowStock });
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

    res.json({ status: "success", count: finalHistory.length, history: finalHistory });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch inventory history" });
  }
});

// ─── ADD STOCK (restock) ──────────────────────────────────────
router.post("/add-stock", authMiddleware, async (req, res) => {
  try {
    const { materialId, quantity } = req.body;

    if (!materialId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid material ID or quantity" });
    }

    const material = await RawMaterial.findById(materialId);
    if (!material) return res.status(404).json({ message: "Raw material not found" });

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
    res.status(500).json({ message: "Internal Server Error", error: err.message });
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
    if (!material) return res.status(404).json({ message: "Raw material not found" });

    const branchStock = await BranchStock.findOne({
      branchId: req.branchId,
      rawMaterialId: materialId,
    });
    if (!branchStock) return res.status(404).json({ message: "Stock record not found" });

    // User types in display units → convert to base units
    const newBaseQty = convertToBaseUnit(Number(newQuantity), material.unit);
    const difference = newBaseQty - branchStock.quantity; // both in base units

    branchStock.quantity = newBaseQty;
    await branchStock.save();

    await InventoryHistory.create({
      rawMaterialId: materialId,  // ← correct: materialId from req.body
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
    if (!from || !to) return res.status(400).json({ message: "from and to dates are required" });

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
router.get("/inventory/consumption-summary", authMiddleware, async (req, res) => {
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
      { $group: { _id: "$rawMaterialId", totalUsedBase: { $sum: { $abs: "$change" } }, usageCount: { $sum: 1 } } },
      { $lookup: { from: "rawmaterials", localField: "_id", foreignField: "_id", as: "material" } },
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
    res.status(500).json({ message: "Failed to generate consumption summary" });
  }
});

module.exports = router;