import { GoogleGenAI } from "@google/genai";
import { AIConnection } from "./ai-connection";

export async function generatePainting(aiConnection: AIConnection, imageData: string): Promise<string[]> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = {
    responseModalities: ["IMAGE"],
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
          text: "Transform this image into a beautiful artistic painting",
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  const imageUrls: string[] = [];
  for await (const chunk of response) {
    if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
      continue;
    }

    const parts = chunk.candidates[0].content.parts;
    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType: mt, data: d } = part.inlineData;
        const imageUrl = `data:${mt};base64,${d}`;
        imageUrls.push(imageUrl);
      }
    }
  }

  return imageUrls;
}
