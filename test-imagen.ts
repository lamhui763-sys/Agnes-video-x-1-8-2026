import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const response = await ai.models.generateImages({
      model: "gemini-3.1-flash-image",
      prompt: "a cat",
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg"
      }
    });
    console.log("Success generateImages!", response.generatedImages[0].image.imageBytes.substring(0, 10));
  } catch(e) {
    console.log("generateImages error:", e.message);
  }
}
run();
