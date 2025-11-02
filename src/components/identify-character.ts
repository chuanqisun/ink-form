import { GoogleGenAI } from "@google/genai";
import { AIConnection } from "./ai-connection";

export async function identifyCharacter(aiConnection: AIConnection, imageData: string): Promise<string> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = {
    responseModalities: ["TEXT"],
  };
  const model = "gemini-2.5-flash-image-preview";

  // Parse the image data (assuming it's a data URL like data:image/jpeg;base64,...)
  let data: string;
  let mimeType: string;
  if (imageData.startsWith("data:")) {
    const [mime, base64] = imageData.split(",");
    mimeType = mime.split(":")[1].split(";")[0];
    data = base64;
  } else {
    // Assume it's raw base64 data
    data = imageData;
    mimeType = "image/jpeg"; // Default assumption
  }

  const contents = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            data,
            mimeType,
          },
        },
        {
          text: `Identify the Chinese calligraphy character in this image. Respond only with the character in Chinese and in English. In this format:
"""
Character: <Chinese Character>
Meaning: <English Meaning>
"""
Do not include any other text.`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  let result = "";
  for await (const chunk of response) {
    if (chunk.text) {
      result += chunk.text;
    }
  }

  return result.trim();
}
