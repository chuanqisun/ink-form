export class DrawingCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean;

  constructor(canvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.isDrawing = false;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.strokeStyle = "#000";
    this.canvas.addEventListener("pointerdown", (e: PointerEvent) => this.startDrawing(e));
    this.canvas.addEventListener("pointermove", (e: PointerEvent) => this.draw(e));
    this.canvas.addEventListener("pointerup", () => this.stopDrawing());
    this.canvas.addEventListener("pointerout", () => this.completeDrawing());
  }

  readImage() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  writeImage(data: ImageData): void {
    this.ctx.putImageData(data, 0, 0);
  }

  private startDrawing(e: PointerEvent): void {
    this.isDrawing = true;
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

  private stopDrawing(): void {
    this.isDrawing = false;
  }

  private completeDrawing(): void {
    this.dispatchEvent(new CustomEvent("drawingstop"));
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
