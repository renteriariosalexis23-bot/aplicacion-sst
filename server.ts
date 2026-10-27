import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Generic proxy route for Gemini API JSON Generation
  app.post("/api/gemini/generate-json", async (req, res) => {
    let apiKey = process.env.GEMINI_API_KEY;
    
    // Hardcode fallback for testing in this specific environment
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        apiKey = "AIzaSyB94F4p4aOCQESz4iuoYcTk7HXBsj17awM";
    }

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      return res.status(500).json({ error: "Por favor, configura una clave de API de Gemini válida en los ajustes de Secrets (GEMINI_API_KEY)." });
    }


    
    apiKey = apiKey.trim();

    try {
      const ai = new GoogleGenAI({ apiKey });
      const { prompt, schema } = req.body;
      
      const config: any = {
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
      res.json(JSON.parse(text));
    } catch (e: any) {
      console.error("Error from Gemini:", e);
      let errorMessage = `Ocurrió un error al procesar con IA: ${e.message || 'Inténtalo de nuevo.'}`;
      if (e?.message?.includes("API key not valid") || e?.status === 400 || e?.status === "INVALID_ARGUMENT") {
         errorMessage = "Clave de API de Gemini inválida. Por favor, verifica tu clave en los ajustes de Secrets.";
      } else if (e?.status === 503 || e?.status === "UNAVAILABLE" || e?.message?.includes("503") || e?.message?.includes("high demand")) {
         errorMessage = "El servidor de Inteligencia Artificial está experimentando alta demanda en este momento. Por favor, espera unos segundos e inténtalo de nuevo.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
