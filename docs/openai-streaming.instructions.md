```js
import { OpenAI } from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  dangerouslyAllowBrowser: true,
  apiKey: "your-api-key-here",
});

// Example API call for structured JSON output
(async () => {
  const prompt = `
Analyze this product image and generate conceptual and material properties.

Respond in this JSON format:
{
  "properties": [
    {
      "name": "string",
      "lowEnd": "string",
      "highEnd": "string"
    }
  ]
}
  `.trim();

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: "https://example.com/image.jpg", detail: "auto" },
        ],
      },
    ],
    reasoning: { effort: "minimal" },
    text: { verbosity: "low", format: { type: "json_object" } },
    stream: false, // Set to false for non-streaming to get full response
  });

  // Basic response structure (non-streaming)
  console.log(response);
})();
```
