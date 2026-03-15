const express = require("express");
const Reciperouter = express.Router();
const Recipe = require("../models/Recipe");
const Items = require("../models/Item");
const authMiddleware = require("../middleware/Authmiddleware");
const convertToBaseUnit = require("../utils/unitconverter");

Reciperouter.post("/save", authMiddleware, async (req, res) => {
  try {
    const { itemId, productId, materials, outputQuantity, outputUnit } =
      req.body;

    // Determine product
    const finalProductId = itemId || productId;
    const finalProductTypeRef = itemId ? "Item" : "RawMaterial";
    const finalProductType = itemId ? "ITEM" : "COMPOSITE";

    // 🔹 Convert recipe ingredients to base units
    const normalizedMaterials = materials.map((m) => {
      return {
        rawMaterialId: m.rawMaterialId,
        // 🔥 Use the helper here!
        quantityRequired: convertToBaseUnit(m.quantityRequired, m.unit),
      };
    });
    const recipe = await Recipe.findOneAndUpdate(
      {
        productId: finalProductId,
      },
      {
        productId: finalProductId,
        productType: finalProductType,
        productTypeRef: finalProductTypeRef,
        materials: normalizedMaterials,
        outputQuantity: outputQuantity || 1,
        outputUnit: outputUnit || "pcs",
      },
      {
        upsert: true,
        new: true,
      },
    );

    res.json({
      status: "success",
      recipe,
    });
  } catch (err) {
    console.error("SAVE RECIPE ERROR:", err);

    res.status(500).json({
      message: "Failed to save recipe",
    });
  }
});
Reciperouter.put("/update_recipe/:id", authMiddleware, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const { materials } = req.body;

    const recipe = await Recipe.findOneAndUpdate(
      { _id: recipeId },
      { materials },
      { new: true },
    );

    if (!recipe) {
      return res.status(404).json({
        status: "error",
        message: "Recipe not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Recipe updated successfully",
      recipe,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Failed to update recipe",
    });
  }
});

Reciperouter.get("/item/:itemId", authMiddleware, async (req, res) => {
  try {
    const recipe = await Recipe.findOne({
      productId: req.params.itemId,
    }).populate("materials.rawMaterialId");

    res.json(recipe);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch recipe" });
  }
});
Reciperouter.delete("/delete/:id", async (req, res) => {
  try {
    const deleted = await Recipe.findOneAndDelete({
      _id: req.params.id,
    });

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Recipe not found",
      });
    }

    res.json({
      status: "success",
      message: "Recipe deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Delete failed",
    });
  }
});

// GET ALL RECIPES (branch-wise)
Reciperouter.get("/savedrecipelist", authMiddleware, async (req, res) => {
  try {
    const recipes = await Recipe.find()
      .populate({
        path: "productId",
        select: "name price unit",
      })
      .populate({
        path: "materials.rawMaterialId",
        select: "name unit",
      })
      .sort({ updatedAt: -1 });

    res.json({
      status: "success",
      recipes,
    });
  } catch (err) {
    console.error("FETCH_RECIPE_ERROR:", err);
    res.status(500).json({ message: "Failed to fetch recipes" });
  }
});
Reciperouter.post("/produce-material", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { materialId, quantity } = req.body; // quantity is how much composite you want to make (e.g., 5 units of Premix)

    const compositeMaterial =
      await RawMaterial.findById(materialId).session(session);

    if (!compositeMaterial || compositeMaterial.type !== "COMPOSITE") {
      throw new Error("Invalid composite material");
    }

    const recipe = await Recipe.findOne({
      productId: materialId,
      productType: "COMPOSITE",
    }).session(session);

    if (!recipe) {
      throw new Error("Recipe not found for composite material");
    }

    // 1️⃣ Deduct raw materials from THIS BRANCH stock
    for (const mat of recipe.materials) {
      const totalRequired = mat.quantityRequired * quantity;

      const branchStock = await BranchStock.findOne({
        branchId: req.branchId,
        rawMaterialId: mat.rawMaterialId,
      }).session(session);

      if (!branchStock || branchStock.quantity < totalRequired) {
        const raw = await RawMaterial.findById(mat.rawMaterialId);
        throw new Error(`Insufficient stock for ${raw?.name || "ingredient"}`);
      }

      await BranchStock.updateOne(
        { _id: branchStock._id },
        { $inc: { quantity: -totalRequired } },
        { session },
      );
    }

    // 2️⃣ Increase the composite material stock for THIS BRANCH
    await BranchStock.updateOne(
      {
        branchId: req.branchId,
        rawMaterialId: materialId,
      },
      { $inc: { quantity: quantity } },
      { session, upsert: true },
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ status: "success", message: "Production successful" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
});
module.exports = Reciperouter;
