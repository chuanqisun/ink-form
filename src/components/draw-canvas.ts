export class DrawingCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean;
  private hasDrawn: boolean;
  private dispatched: boolean;

  constructor(canvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.isDrawing = false;
    this.hasDrawn = false;
    this.dispatched = false;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.strokeStyle = "#000";
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.addEventListener("pointerdown", (e: PointerEvent) => this.startDrawing(e));
    this.canvas.addEventListener("pointermove", (e: PointerEvent) => this.draw(e));
    this.canvas.addEventListener("pointerup", () => this.handlePointerup());
    this.canvas.addEventListener("pointerout", () => this.handleFinishDrawing());
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  readImage() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  writeImage(data: ImageData): void {
    this.ctx.putImageData(data, 0, 0);
  }

  private startDrawing(e: PointerEvent): void {
    this.isDrawing = true;
    this.hasDrawn = false;
    this.dispatched = false;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  private draw(e: PointerEvent): void {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.stroke();
  }

  private handlePointerup(): void {
    this.isDrawing = false;
    this.hasDrawn = true;
  }

  private handleFinishDrawing(): void {
    if (this.hasDrawn && !this.dispatched) {
      this.dispatchEvent(new CustomEvent("drawingstop"));
      this.dispatched = true;
    }
  }

  getBoundingBox(): { x: number; y: number; width: number; height: number } | null {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    let minX = this.canvas.width;
    let minY = this.canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const index = (y * this.canvas.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (r !== 255 || g !== 255 || b !== 255) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  clear(): void {
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
    this.dispatched = false;
  }
}
