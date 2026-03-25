import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.get("/api/key", (req, res) => {
  res.json({
    apiKey: process.env.GEMINI_API_KEY
  });
});

app.listen(3000);
