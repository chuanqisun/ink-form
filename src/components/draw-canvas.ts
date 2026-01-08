export class DrawingCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean;
  private hasDrawn: boolean;
  private dispatched: boolean;
  private drawingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastX: number = 0;
  private lastY: number = 0;
  private lastW: number = 18;
  private lastDX: number = 0;
  private lastDY: number = 0;
  private lastV: number = 0;

  private readonly MAX_W = 14;
  private readonly MIN_W = 2;
  private readonly SPEED_LIMIT = 40;
  private readonly LERP_SPEED = 0.15;

  constructor(canvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.isDrawing = false;
    this.hasDrawn = false;
    this.dispatched = false;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
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

  private getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const style = window.getComputedStyle(this.canvas);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const borderTop = parseFloat(style.borderTopWidth);
    const scaleX = this.canvas.width / (rect.width - borderLeft - parseFloat(style.borderRightWidth));
    const scaleY = this.canvas.height / (rect.height - borderTop - parseFloat(style.borderBottomWidth));
    return {
      x: (clientX - rect.left - borderLeft) * scaleX,
      y: (clientY - rect.top - borderTop) * scaleY,
    };
  }

  private startDrawing(e: PointerEvent): void {
    this.isDrawing = true;
    this.hasDrawn = false;
    this.dispatched = false;
    this.resetTimer();
    const pos = this.getCanvasPoint(e.clientX, e.clientY);
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastW = this.MAX_W;
    this.lastDX = 0;
    this.lastDY = 0;
    this.lastV = 0;
  }

  private draw(e: PointerEvent): void {
    if (!this.isDrawing) return;
    this.resetTimer();
    const pos = this.getCanvasPoint(e.clientX, e.clientY);

    const dx = pos.x - this.lastX;
    const dy = pos.y - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 1. Calculate the target width based on speed
    const targetW = Math.max(this.MIN_W, this.MAX_W - (dist / this.SPEED_LIMIT) * (this.MAX_W - this.MIN_W));

    // 2. Sub-segmenting: Bridge the gap between mouse events
    // We draw a line every 2 pixels to ensure the width tapers smoothly
    const steps = Math.max(1, Math.ceil(dist / 2));

    let currentX = this.lastX;
    let currentY = this.lastY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;

      // Interpolate position
      const nextX = this.lastX + dx * t;
      const nextY = this.lastY + dy * t;

      // Interpolate width (Lerp from last width to target width)
      const nextW = this.lastW + (targetW - this.lastW) * (i / steps) * this.LERP_SPEED;

      this.ctx.beginPath();
      this.ctx.lineWidth = nextW;
      this.ctx.moveTo(currentX, currentY);
      this.ctx.lineTo(nextX, nextY);
      this.ctx.stroke();

      currentX = nextX;
      currentY = nextY;
    }

    // Store state for next frame
    this.lastDX = dx;
    this.lastDY = dy;
    this.lastV = dist;
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastW = this.lastW + (targetW - this.lastW) * this.LERP_SPEED;
    this.hasDrawn = true;
  }

  private handlePointerup(): void {
    if (!this.isDrawing) return;

    // 3. The "Flick" (Sharp Ending)
    // If moving fast when released, continue the line while tapering to zero
    if (this.lastV > 6) {
      let flickX = this.lastX;
      let flickY = this.lastY;
      let flickW = this.lastW;

      for (let i = 0; i < 10; i++) {
        const nextX = flickX + this.lastDX * 0.15;
        const nextY = flickY + this.lastDY * 0.15;
        const nextW = flickW * 0.75;

        this.ctx.beginPath();
        this.ctx.lineWidth = nextW;
        this.ctx.moveTo(flickX, flickY);
        this.ctx.lineTo(nextX, nextY);
        this.ctx.stroke();

        flickX = nextX;
        flickY = nextY;
        flickW = nextW;
        if (flickW < 0.5) break;
      }
    }

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
