import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image must be a base64 string" });
    }

    // Remove data URL prefix if present
    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    // Gemini payload
    const payload = {
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
              inlineData: base64Data, // ✅ must be string only
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    };

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const aiData = await apiRes.json();

    if (aiData.error) {
      console.error("Gemini API Error:", aiData.error);
      return res.status(500).json({ error: "AI Service Error: " + aiData.error.message });
    }

    const resultText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) return res.status(500).json({ error: "AI returned empty response" });

    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON", raw: resultText });
    }

    if (parsed.error) return res.status(400).json({ error: parsed.error });

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
    console.error("Server Crash:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
