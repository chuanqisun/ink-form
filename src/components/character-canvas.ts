export class CharacterCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  static createElement(canvasId: string): HTMLCanvasElement {
    const charCanvas = document.createElement("canvas");
    charCanvas.id = canvasId;
    charCanvas.width = 360;
    charCanvas.height = 640;
    charCanvas.style.position = "absolute";
    charCanvas.style.top = "0";
    charCanvas.style.left = "0";

    return charCanvas;
  }

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

  writeImage(data: ImageData) {
    this.ctx.putImageData(data, 0, 0);
  }

  async writeDataUrl(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        resolve();
      };
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });
  }

  clear() {
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.canvas.remove();
  }
}
