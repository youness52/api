// api/index.js
import express from "express";
import serverless from "serverless-http";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/analyze", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `
Analyze food in this image and return JSON:
{ "name": "string", "calories": number, "protein": number, "carbs": number, "fat": number, "servingSize": "string", "category": "protein|carbs|fruit|vegetable|dairy|snack|beverage|other" }
If not food: { "error": "No food detected" }
            `,
            },
            { inlineData: base64Data },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const aiData = await response.json();
    const resultText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) return res.status(500).json({ error: "AI returned empty response" });

    let parsed;
    try { parsed = JSON.parse(resultText); } 
    catch { return res.status(500).json({ error: "AI returned invalid JSON", raw: resultText }); }

    if (parsed.error) return res.status(400).json({ error: parsed.error });

    res.json({
      name: parsed.name || "Unknown Food",
      calories: parsed.calories || 0,
      protein: parsed.protein || 0,
      carbs: parsed.carbs || 0,
      fat: parsed.fat || 0,
      servingSize: parsed.servingSize || "1 serving",
      category: parsed.category || "other",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Wrap Express with serverless-http
export default serverless(app);
