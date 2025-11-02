export class GenerativeCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
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
    // Create a new canvas to compose the overlay
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = this.canvas.width;
    overlayCanvas.height = this.canvas.height;
    const overlayCtx = overlayCanvas.getContext("2d")!;

    // Draw the current canvas content
    overlayCtx.drawImage(this.canvas, 0, 0);

    // Draw the red rectangle overlay
    overlayCtx.strokeStyle = "red";
    overlayCtx.lineWidth = 2;
    overlayCtx.fillStyle = "transparent";
    overlayCtx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);

    // Return the data URL of the composed image
    return overlayCanvas.toDataURL();
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
