import { GoogleGenAI } from "@google/genai";
import { Observable } from "rxjs";
import { AIConnection } from "./ai-connection";

export interface DesignSoundProps {
  connection: AIConnection;
  concept: string;
}

/**
 * Uses Gemini to turn a text concept into a one-sentence sound effect description.
 */
export function designSound(props: DesignSoundProps): Observable<string> {
  const { connection, concept } = props;

  return new Observable<string>((subscriber) => {
    let aborted = false;

    const run = async () => {
      try {
        const apiKey = connection.getApiKey();
        if (!apiKey) {
          throw new Error("API key not found. Please connect to AI first.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const model = "gemini-2.5-flash";
        const prompt = `Based on the concept "${concept}", write a one-sentence sound effect description for a text-to-sound AI. 
The description should be poetic, relevant and focus on the literal sound elements. 
Do not include any other text or preamble. 
Example concept: "Rain", output: "Soft, pitter-patter sound of rain hitting a series of bamboo leaves in a quiet garden."`;

        if (aborted) return;

        console.time("designSound");
        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseModalities: ["TEXT"],
            temperature: 0.2,
          },
        });

        let result = "";
        for await (const chunk of response) {
          if (aborted) return;
          if (chunk.text) {
            result += chunk.text;
          }
        }
        console.timeEnd("designSound");

        subscriber.next(result.trim());
        subscriber.complete();
      } catch (err) {
        if (!aborted) {
          subscriber.error(err);
        }
      }
    };

    run();

    return () => {
      aborted = true;
    };
  });
}
