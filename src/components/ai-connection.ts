export class AIConnection {
  private apiKey: string | null;
  private isConnected: boolean;

  constructor() {
    this.apiKey = null;
    this.isConnected = false;
    this.initEventListeners();
    this.loadApiKey();
  }

  private initEventListeners(): void {
    const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
    const disconnectBtn = document.getElementById("disconnect-btn") as HTMLButtonElement;
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;

    connectBtn.addEventListener("click", () => this.connect());
    disconnectBtn.addEventListener("click", () => this.disconnect());

    // Allow Enter key to connect
    apiKeyInput.addEventListener("keypress", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        this.connect();
      }
    });
  }

  private loadApiKey(): void {
    const stored = localStorage.getItem("google_ai_api_key");
    if (stored) {
      this.apiKey = stored;
      this.setConnected(true);
    }
  }

  private connect(): void {
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      this.updateStatus("Please enter an API key", "error");
      return;
    }

    // Store the API key
    this.apiKey = apiKey;
    localStorage.setItem("google_ai_api_key", apiKey);
    this.setConnected(true);
    this.updateStatus("Connected successfully!", "success");
  }

  private disconnect(): void {
    this.apiKey = null;
    localStorage.removeItem("google_ai_api_key");
    this.setConnected(false);
    (document.getElementById("api-key-input") as HTMLInputElement).value = "";
    this.updateStatus("Disconnected", "info");
  }

  private setConnected(connected: boolean): void {
    this.isConnected = connected;
    const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
    const disconnectBtn = document.getElementById("disconnect-btn") as HTMLButtonElement;
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;

    if (connected) {
      connectBtn.style.display = "none";
      disconnectBtn.style.display = "inline-block";
      apiKeyInput.disabled = true;
      apiKeyInput.value = this.apiKey!;
    } else {
      connectBtn.style.display = "inline-block";
      disconnectBtn.style.display = "none";
      apiKeyInput.disabled = false;
      apiKeyInput.value = "";
    }
  }

  private updateStatus(message: string, type: "info" | "error" | "success" = "info"): void {
    const statusDiv = document.getElementById("connection-status") as HTMLDivElement;
    statusDiv.textContent = message;
    statusDiv.style.color = type === "error" ? "red" : type === "success" ? "green" : "blue";
  }

  getApiKey() {
    return this.apiKey;
  }

  isAPIConnected() {
    return this.isConnected;
  }
}
