import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Rate Limiter
const requests = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 15;
  if (!requests.has(ip)) requests.set(ip, []);
  const timestamps = requests.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  requests.set(ip, timestamps);
  return timestamps.length > maxRequests;
}

app.post("/analyze", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (isRateLimited(ip)) return res.status(429).json({ error: "Too many requests" });

    let { image } = req.body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    // Remove base64 prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    const payload = {
      contents: [{
        parts: [
          { text: "Analyze the food in this image and return ONLY JSON: { \"name\": \"string\", \"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number, \"servingSize\": \"string\", \"category\": \"protein|carbs|fruit|vegetable|dairy|snack|beverage|other\" }. If not food: { \"error\": \"No food detected\" }" },
          { 
            inlineData: { 
              mimeType: "image/jpeg", 
              data: base64Data 
            } 
          }
        ]
      }],
      generationConfig: { 
        temperature: 0.1, 
        responseMimeType: "application/json" 
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    // Debugging: Log Google's error if it exists
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return res.status(500).json({ error: "AI Service Error "+ data.error });
    }

    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) return res.status(500).json({ error: "AI returned empty response" });

    const parsed = JSON.parse(resultText);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // Send cleaned data back to frontend
    res.json(parsed);

  } catch (err) {
    console.error("Server Crash:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
