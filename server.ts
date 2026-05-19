import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini Setup
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.post("/api/generate-words", async (req, res) => {
    let attempts = 0;
    const maxAttempts = 3;
    
    const generate = async () => {
      try {
        const { level, count = 5 } = req.body;
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Generiere ${count} englische Vokabeln für das Sprachniveau ${level || 'Anfänger'}. 
          Gib die Antwort als JSON-Array von Objekten zurück. 
          Jedes Objekt soll folgende Felder haben: 
          - word: das englische Wort
          - translation: die deutsche Übersetzung
          - definition: eine kurze Definition auf Englisch
          - examples: ein Array mit 2 Beispielsätzen auf Englisch`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  examples: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                },
                required: ["word", "translation", "definition", "examples"],
              }
            }
          }
        });

        const result = JSON.parse(response.text || "[]");
        if (!Array.isArray(result)) {
           throw new Error("API did not return an array");
        }
        return result;
      } catch (error: any) {
        if (attempts < maxAttempts && (error.message?.includes("503") || error.message?.includes("high demand"))) {
          attempts++;
          console.log(`Retry attempt ${attempts} after 503 error...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
          return generate();
        }
        throw error;
      }
    };

    try {
      const result = await generate();
      res.json(result);
    } catch (error: any) {
      console.error("Error generating words:", error);
      // Return an empty array instead of crashing the frontend if possible, 
      // but log the error so we know it happened.
      res.status(500).json({ error: error.message, fallback: [] });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, systemInstruction } = req.body;
      
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: systemInstruction || "You are an English teacher helping a student. Answer in German if necessary but encourage English usage.",
        },
      });

      // Simple implementation: send the last message
      // In a real app, we might want to send the whole history
      const lastMessage = messages[messages.length - 1].content;
      const response = await chat.sendMessage({ message: lastMessage });
      
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
