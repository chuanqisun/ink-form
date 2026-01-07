export class DrawingCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean;
  private hasDrawn: boolean;
  private dispatched: boolean;
  private drawingTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.canvas.addEventListener("pointerdown", (e: PointerEvent) => this.startDrawing(e));
    this.canvas.addEventListener("pointermove", (e: PointerEvent) => this.draw(e));
    this.canvas.addEventListener("pointerup", () => this.handlePointerup());
    this.canvas.addEventListener("mouseout", () => this.handleFinishDrawing());
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  readImage() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  readBase64DataUrl(transparency?: boolean): string {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    if (!transparency) {
      tempCtx.fillStyle = "white";
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    tempCtx.drawImage(this.canvas, 0, 0);
    return tempCanvas.toDataURL();
  }

  writeImage(data: ImageData): void {
    this.ctx.putImageData(data, 0, 0);
  }

  private clearDrawingTimer(): void {
    if (this.drawingTimer) {
      clearTimeout(this.drawingTimer);
      this.drawingTimer = null;
    }
  }

  private resetTimer(): void {
    this.clearDrawingTimer();
    this.drawingTimer = setTimeout(() => this.handleFinishDrawing(), 1000);
  }

  private startDrawing(e: PointerEvent): void {
    this.isDrawing = true;
    this.hasDrawn = false;
    this.dispatched = false;
    this.resetTimer();
    const rect = this.canvas.getBoundingClientRect();
    const style = window.getComputedStyle(this.canvas);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const borderTop = parseFloat(style.borderTopWidth);
    const scaleX = this.canvas.width / (rect.width - borderLeft - parseFloat(style.borderRightWidth));
    const scaleY = this.canvas.height / (rect.height - borderTop - parseFloat(style.borderBottomWidth));
    this.ctx.beginPath();
    this.ctx.moveTo((e.clientX - rect.left - borderLeft) * scaleX, (e.clientY - rect.top - borderTop) * scaleY);
  }

  private draw(e: PointerEvent): void {
    if (!this.isDrawing) return;
    this.resetTimer();
    const rect = this.canvas.getBoundingClientRect();
    const style = window.getComputedStyle(this.canvas);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const borderTop = parseFloat(style.borderTopWidth);
    const scaleX = this.canvas.width / (rect.width - borderLeft - parseFloat(style.borderRightWidth));
    const scaleY = this.canvas.height / (rect.height - borderTop - parseFloat(style.borderBottomWidth));
    this.ctx.lineTo((e.clientX - rect.left - borderLeft) * scaleX, (e.clientY - rect.top - borderTop) * scaleY);
    this.ctx.stroke();
  }

  private handlePointerup(): void {
    this.isDrawing = false;
    this.hasDrawn = true;
  }

  private handleFinishDrawing(): void {
    this.clearDrawingTimer();
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
        const alpha = data[index + 3];
        if (alpha > 0) {
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
    this.dispatched = false;
    this.clearDrawingTimer();
  }
}
