const express = require("express");
const Reciperouter = express.Router();
const Recipe = require("../models/Recipe");
const Items = require("../models/Item");
const authMiddleware = require("../middleware/Authmiddleware");

Reciperouter.post("/save", authMiddleware, async (req, res) => {
  try {
    const { itemId, materials } = req.body;

    const recipe = await Recipe.findOneAndUpdate(
      {
        itemId,
        branchId: req.branchId,
      },
      {
        itemId,
        materials,
        branchId: req.branchId,
      },
      {
        upsert: true,
        new: true,
      },
    );

    res.json({
      message: "Recipe saved successfully",
      recipe,
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save recipe" });
  }
});
Reciperouter.put("/update_recipe/:id", authMiddleware, async (req, res) => {
  try {
    const recipeId = req.params.id;
    const { materials } = req.body;

    const recipe = await Recipe.findOneAndUpdate(
      {
        _id: recipeId,
        branchId: req.branchId,
      },
      {
        materials,
      },
      {
        new: true,
      },
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
      itemId: req.params.itemId,
      branchId: req.branchId,
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
      branchId: req.branchId,
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
    const recipes = await Recipe.find({
      branchId: req.branchId,
    })
      // ✅ attach item details
      .populate({
        path: "itemId",
        select: "name price",
      })
      // ✅ attach raw material details
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
    console.error(err);
    res.status(500).json({ message: "Failed to fetch recipes" });
  }
});

module.exports = Reciperouter;
