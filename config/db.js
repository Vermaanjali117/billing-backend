const mongoose = require("mongoose");

const connectDB = async () => {
  try {
        console.log("MONGO_URI from env:", process.env.MONGO_URI); 
    await mongoose.connect(process.env.MONGO_URI, {
      
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

module.exports = connectDB;
