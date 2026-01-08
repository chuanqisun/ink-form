export class GenerativeCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  constructor(canvasId: string, overlayCanvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

    this.overlayCanvas = document.getElementById(overlayCanvasId) as HTMLCanvasElement;
    if (this.overlayCanvas) {
      this.overlayCtx = this.overlayCanvas.getContext("2d")!;
    }
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  readImage() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  isCanvasEmpty(): boolean {
    const imageData = this.readImage();
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0) {
        return false; // Found a non-transparent pixel
      }
    }
    return true; // All pixels are transparent
  }

  getOverlayImage(boundingBox: { x: number; y: number; width: number; height: number }) {
    if (!this.overlayCanvas || !this.overlayCtx) {
      throw new Error("Overlay canvas not initialized");
    }

    // Clear and match dimensions
    this.overlayCanvas.width = this.canvas.width;
    this.overlayCanvas.height = this.canvas.height;
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    // Draw the current canvas content
    this.overlayCtx.drawImage(this.canvas, 0, 0);

    // Draw the red rectangle overlay
    this.overlayCtx.strokeStyle = "red";
    this.overlayCtx.lineWidth = 2;
    this.overlayCtx.fillStyle = "transparent";
    this.overlayCtx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);

    // Return the data URL of the composed image
    return this.overlayCanvas.toDataURL();
  }

  clearOverlay(): void {
    if (this.overlayCtx) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas!.width, this.overlayCanvas!.height);
    }
  }

  writeImage(data: ImageData): void {
    this.ctx.putImageData(data, 0, 0);
  }

  async writeDataUrl(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  clear(): void {
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
