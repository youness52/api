import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 🔒 Simple rate limit (anti abuse)
const requests = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 min
  const maxRequests = 15;

  if (!requests.has(ip)) {
    requests.set(ip, []);
  }

  const timestamps = requests.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  requests.set(ip, timestamps);

  return timestamps.length > maxRequests;
}

app.post("/analyze", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests" });
    }

    const { image } = req.body;

    // ✅ Validate input
    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a professional nutritionist.

Analyze the food in this image and return ONLY JSON:

{
  "name": "Food name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "servingSize": "string",
  "category": "protein | carbs | fruit | vegetable | dairy | snack | beverage | other"
}

If not food:
{ "error": "No food detected" }
                  `,
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();

    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
//return res.status(500).json(data);
    if (!resultText) {
      return res.status(500).json({ error: "Invalid AI response" });
    }

    // ✅ Safe JSON parsing
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (e) {
      console.error("Parse error:", resultText);
      return res.status(500).json({ error: "Invalid JSON from AI" });
    }

    // ✅ Normalize response
    if (parsed.error) {
      return res.status(400).json(parsed);
    }

    return res.json({
      name: parsed.name || "Unknown Food",
      calories: parsed.calories || 0,
      protein: parsed.protein || 0,
      carbs: parsed.carbs || 0,
      fat: parsed.fat || 0,
      servingSize: parsed.servingSize || "1 serving",
      category: parsed.category || "other",
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("API is running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
