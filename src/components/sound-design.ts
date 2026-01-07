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
        const prompt = `Based on the concept "${concept}", write a one-sentence sound effect prompt for a text-to-sound AI. 
The sound will be used to augment the experience of a Chinese traditional painting.
The description should be a familiar sound that is clearly associated to the concept. If the concept does not naturally make a sound, describe Chinese traditional melody instead.
In all scenarios, make sure the sound is loud and clear.
Do not include any other text or preamble.`;

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
