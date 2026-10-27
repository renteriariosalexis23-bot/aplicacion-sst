import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      apiKey = "AIzaSyB94F4p4aOCQESz4iuoYcTk7HXBsj17awM";
  }

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(500).json({ error: "Por favor, configura una clave de API de Gemini válida en las variables de entorno (GEMINI_API_KEY)." });
  }
  
  apiKey = apiKey.trim();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { prompt, schema } = req.body;
    
    const config = {
      responseMimeType: "application/json",
    };
    if (schema) {
       config.responseSchema = schema;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config,
    });

    const text = response.text || "{}";
    res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error("Error from Gemini API:", e);
    let errorMessage = `Ocurrió un error al procesar con IA: ${e.message || 'Inténtalo de nuevo.'}`;
    
    if (e?.message?.includes("API key not valid") || e?.status === 400 || e?.status === "INVALID_ARGUMENT") {
       errorMessage = "Clave de API de Gemini inválida. Por favor, verifica tu clave de entorno.";
    } else if (e?.status === 503 || e?.status === "UNAVAILABLE" || e?.message?.includes("503") || e?.message?.includes("high demand")) {
       errorMessage = "El servidor de Inteligencia Artificial está experimentando alta demanda en este momento. Por favor, espera unos segundos e inténtalo de nuevo.";
    }
    
    res.status(500).json({ error: errorMessage });
  }
}
