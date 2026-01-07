export class AIConnection {
  private apiKey: string | null;
  private elevenLabsApiKey: string | null;
  private isConnected: boolean;

  constructor() {
    this.apiKey = null;
    this.elevenLabsApiKey = null;
    this.isConnected = false;
    this.initEventListeners();
    this.loadApiKey();
  }

  private initEventListeners(): void {
    const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
    const elevenLabsApiKeyInput = document.getElementById("elevenlabs-api-key-input") as HTMLInputElement;

    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.reset());
    }

    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
        this.apiKey = apiKeyInput.value.trim();
        localStorage.setItem("google_ai_api_key", this.apiKey);
        this.updateConnectionStatus();
      });
    }

    if (elevenLabsApiKeyInput) {
      elevenLabsApiKeyInput.addEventListener("input", () => {
        this.elevenLabsApiKey = elevenLabsApiKeyInput.value.trim();
        localStorage.setItem("elevenlabs_api_key", this.elevenLabsApiKey);
        this.updateConnectionStatus();
      });
    }
  }

  private loadApiKey(): void {
    const stored = localStorage.getItem("google_ai_api_key");
    const storedElevenLabs = localStorage.getItem("elevenlabs_api_key");
    if (stored) {
      this.apiKey = stored;
    }
    if (storedElevenLabs) {
      this.elevenLabsApiKey = storedElevenLabs;
    }
    this.updateConnectionStatus(true);
  }

  private updateConnectionStatus(updateInputs = false): void {
    const hasGoogle = !!this.apiKey;
    const hasEleven = !!this.elevenLabsApiKey;
    this.isConnected = hasGoogle || hasEleven;

    if (updateInputs) {
      const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
      const elevenLabsApiKeyInput = document.getElementById("elevenlabs-api-key-input") as HTMLInputElement;
      if (apiKeyInput) apiKeyInput.value = this.apiKey || "";
      if (elevenLabsApiKeyInput) elevenLabsApiKeyInput.value = this.elevenLabsApiKey || "";
    }

    if (this.isConnected) {
      this.updateStatus("Keys loaded", "success");
    } else {
      this.updateStatus("No keys configured", "info");
    }
  }

  private reset(): void {
    this.apiKey = null;
    this.elevenLabsApiKey = null;
    localStorage.removeItem("google_ai_api_key");
    localStorage.removeItem("elevenlabs_api_key");
    this.updateConnectionStatus(true);
  }

  private updateStatus(message: string, type: "info" | "error" | "success" = "info"): void {
    const statusDiv = document.getElementById("connection-status") as HTMLDivElement;
    statusDiv.textContent = message;
    statusDiv.style.color = type === "error" ? "red" : type === "success" ? "green" : "blue";
  }

  getApiKey() {
    return this.apiKey;
  }

  getElevenLabsApiKey() {
    return this.elevenLabsApiKey;
  }

  isAPIConnected() {
    return this.isConnected;
  }
}
