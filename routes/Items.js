const express = require("express");
const itemRouter = express.Router();
const Item = require("../models/Item");
const upload = require("../multer");
// ✅ Insert new item (POST /api/items/)
itemRouter.post("/addnewitem", upload.single("image"), async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    const image = req.file ? req.file.filename : null;

    const newItem = new Item({ name, category, price, description, image });
    await newItem.save();

    // Build full image URL for frontend usage
    const imageUrl = image
      ? `${req.protocol}://${req.get("host")}/uploads/${image}`
      : null;

    res.status(201).json({
      message: "Item added",
      data: { ...newItem.toObject(), image: imageUrl },
      status: "Success",
    });
  } catch (err) {
    res.status(500).json({ message: "Error adding item", error: err.message });
  }
});

// Edit new item
// Edit item
itemRouter.patch("/edititems", upload.single("image"), async (req, res) => {
  try {
    console.log("req.body:", req.body); // Form fields
    console.log("req.file:", req.file); // Uploaded file (if any)

    const { _id } = req.body;
    if (!_id) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    const item = await Item.findById(_id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Update all fields dynamically except _id
    Object.keys(req.body).forEach((key) => {
      if (key !== "_id") {
        item[key] = req.body[key];
      }
    });

    // Handle new image if uploaded
    if (req.file) {
      item.image = req.file.filename;
    }

    await item.save();

    // Build full image URL for frontend
    const imageUrl = item.image
      ? `${req.protocol}://${req.get("host")}/uploads/${item.image}`
      : null;

    res.status(200).json({
      message: "Edited Successfully",
      status: 'Success',
      data: { ...item.toObject(), image: imageUrl },
    });
  } catch (error) {
    console.error("error ====", error);
    res
      .status(500)
      .json({ message: "Error editing item", error: error.message });
  }
});

// delete item
itemRouter.delete("/deleteitem", async (req, res) => {
  try {
    const { _id } = req.body;
    console.log("_id ============", _id);
    if (_id) {
      const deletedItem = await Item.findByIdAndDelete(_id);

      res
        .status(200)
        .json({ message: "Deleted Successfully", data: deletedItem });
    } else {
      res.status(404).json({ message: "Item not found" });

    }
  } catch (error) {
    console.log("error ====", error);
  }
});

// 📥 Fetch items (GET /api/items/)
itemRouter.get("/getlist", async (req, res) => {
  try {
    const items = await Item.find({});

    // Convert image filenames to full URLs
    const itemsWithUrls = items.map((item) => {
      const imageUrl = item.image
        ? `${req.protocol}://${req.get("host")}/uploads/${item.image}`
        : null;

      return { ...item.toObject(), image: imageUrl };
    });

    res.status(200).json({ data: itemsWithUrls, status: "success" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching items", error: err.message });
  }
});

module.exports = itemRouter;
