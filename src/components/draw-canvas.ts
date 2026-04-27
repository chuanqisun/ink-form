interface Point {
  x: number;
  y: number;
}

type HomographyMatrix = [number, number, number, number, number, number, number, number, number];

const CALIBRATION_CORNERS: readonly Point[] = Object.freeze([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);

const CALIBRATION_INSET_RATIO = 0.06;
const HOMOGRAPHY_EPSILON = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let bestRow = pivotIndex;
    let bestValue = Math.abs(augmented[pivotIndex][pivotIndex]);

    for (let candidate = pivotIndex + 1; candidate < size; candidate += 1) {
      const candidateValue = Math.abs(augmented[candidate][pivotIndex]);
      if (candidateValue > bestValue) {
        bestValue = candidateValue;
        bestRow = candidate;
      }
    }

    if (bestValue < HOMOGRAPHY_EPSILON) {
      return null;
    }

    if (bestRow !== pivotIndex) {
      [augmented[pivotIndex], augmented[bestRow]] = [augmented[bestRow], augmented[pivotIndex]];
    }

    const pivot = augmented[pivotIndex][pivotIndex];
    for (let column = pivotIndex; column <= size; column += 1) {
      augmented[pivotIndex][column] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivotIndex) {
        continue;
      }

      const factor = augmented[row][pivotIndex];
      if (Math.abs(factor) < HOMOGRAPHY_EPSILON) {
        continue;
      }

      for (let column = pivotIndex; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivotIndex][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function computeHomography(sourcePoints: Point[], targetPoints: Point[]): HomographyMatrix | null {
  if (sourcePoints.length !== 4 || targetPoints.length !== 4) {
    return null;
  }

  const matrix: number[][] = [];
  const values: number[] = [];

  for (let index = 0; index < sourcePoints.length; index += 1) {
    const source = sourcePoints[index];
    const target = targetPoints[index];

    matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
    values.push(target.x);

    matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
    values.push(target.y);
  }

  const solution = solveLinearSystem(matrix, values);
  if (!solution) {
    return null;
  }

  return [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1];
}

function applyHomography(matrix: HomographyMatrix, point: Point): Point | null {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < HOMOGRAPHY_EPSILON) {
    return null;
  }

  const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator;
  const y = (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

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
  private readonly MIN_W = 1.0;
  private readonly SPEED_LIMIT = 35;
  private readonly LERP_SPEED = 0.4;

  private inputCalibration: HomographyMatrix | null = null;
  private calibrationFlipX = false;
  private inputLocked = false;
  private usingWindowInput = false;

  // Bound handlers for window-level listeners (so we can remove them)
  private boundStartDrawing = (e: PointerEvent) => this.startDrawing(e);
  private boundDraw = (e: PointerEvent) => this.draw(e);
  private boundPointerup = () => this.handlePointerup();
  private boundFinish = () => this.handleFinishDrawing();
  private boundPreventDefault = (e: Event) => e.preventDefault();

  get hasInputCalibration(): boolean {
    return this.inputCalibration !== null;
  }

  setInputLocked(locked: boolean): void {
    if (this.inputLocked === locked) {
      return;
    }

    this.inputLocked = locked;
    if (locked) {
      this.cancelStroke();
    }
  }

  getCalibrationTargets(): Point[] {
    return CALIBRATION_CORNERS.map(({ x, y }) => ({
      x: (CALIBRATION_INSET_RATIO + x * (1 - CALIBRATION_INSET_RATIO * 2)) * this.canvas.width,
      y: (CALIBRATION_INSET_RATIO + y * (1 - CALIBRATION_INSET_RATIO * 2)) * this.canvas.height,
    }));
  }

  applyInputCalibration(sourcePoints: Point[], targetPoints: Point[]): boolean {
    const normalizedSource = sourcePoints.map((point) => this.normalizeViewportPoint(point));
    const normalizedTarget = targetPoints.map((point) => this.normalizeCanvasPoint(point));
    const nextCalibration = computeHomography(normalizedSource, normalizedTarget);
    if (!nextCalibration) {
      return false;
    }

    this.inputCalibration = nextCalibration;
    this.calibrationFlipX = document.body.classList.contains("flip-x");
    this.syncInputListeners();
    return true;
  }

  clearInputCalibration(): void {
    if (!this.inputCalibration) {
      return;
    }

    this.inputCalibration = null;
    this.syncInputListeners();
  }

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
    this.attachCanvasListeners();
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

  private attachCanvasListeners(): void {
    this.canvas.addEventListener("pointerdown", this.boundStartDrawing);
    this.canvas.addEventListener("pointermove", this.boundDraw);
    this.canvas.addEventListener("pointerup", this.boundPointerup);
    this.canvas.addEventListener("mouseout", this.boundFinish);
  }

  private detachCanvasListeners(): void {
    this.canvas.removeEventListener("pointerdown", this.boundStartDrawing);
    this.canvas.removeEventListener("pointermove", this.boundDraw);
    this.canvas.removeEventListener("pointerup", this.boundPointerup);
    this.canvas.removeEventListener("mouseout", this.boundFinish);
  }

  private attachWindowListeners(): void {
    window.addEventListener("pointerdown", this.boundStartDrawing);
    window.addEventListener("pointermove", this.boundDraw);
    window.addEventListener("pointerup", this.boundPointerup);
    window.addEventListener("touchmove", this.boundPreventDefault, { passive: false } as EventListenerOptions);
    window.addEventListener("dragstart", this.boundPreventDefault);
    window.addEventListener("selectstart", this.boundPreventDefault);
    window.addEventListener("contextmenu", this.boundPreventDefault);
    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
  }

  private detachWindowListeners(): void {
    window.removeEventListener("pointerdown", this.boundStartDrawing);
    window.removeEventListener("pointermove", this.boundDraw);
    window.removeEventListener("pointerup", this.boundPointerup);
    window.removeEventListener("touchmove", this.boundPreventDefault);
    window.removeEventListener("dragstart", this.boundPreventDefault);
    window.removeEventListener("selectstart", this.boundPreventDefault);
    window.removeEventListener("contextmenu", this.boundPreventDefault);
    document.body.style.touchAction = "";
    document.body.style.userSelect = "";
    (document.body.style as any).webkitUserSelect = "";
  }

  private syncInputListeners(): void {
    const shouldUseWindowInput = this.hasInputCalibration;
    if (this.usingWindowInput === shouldUseWindowInput) {
      return;
    }

    this.usingWindowInput = shouldUseWindowInput;
    if (shouldUseWindowInput) {
      this.detachCanvasListeners();
      this.attachWindowListeners();
      return;
    }

    this.detachWindowListeners();
    this.attachCanvasListeners();
  }

  private normalizeViewportPoint(point: Point): Point {
    if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) {
      return point;
    }

    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    return {
      x: point.x / viewportWidth,
      y: point.y / viewportHeight,
    };
  }

  private normalizeCanvasPoint(point: Point): Point {
    if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) {
      return point;
    }

    return {
      x: point.x / this.canvas.width,
      y: point.y / this.canvas.height,
    };
  }

  private getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (this.inputCalibration) {
      const mappedPoint = applyHomography(this.inputCalibration, this.normalizeViewportPoint({ x: clientX, y: clientY }));
      if (!mappedPoint) {
        return null;
      }

      let x = mappedPoint.x * this.canvas.width;
      if (document.body.classList.contains("flip-x") !== this.calibrationFlipX) {
        x = this.canvas.width - x;
      }

      return {
        x: clamp(x, 0, this.canvas.width),
        y: clamp(mappedPoint.y * this.canvas.height, 0, this.canvas.height),
      };
    }

    const rect = this.canvas.getBoundingClientRect();
    const style = window.getComputedStyle(this.canvas);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const borderTop = parseFloat(style.borderTopWidth);
    const scaleX = this.canvas.width / (rect.width - borderLeft - parseFloat(style.borderRightWidth));
    const scaleY = this.canvas.height / (rect.height - borderTop - parseFloat(style.borderBottomWidth));
    let x = (clientX - rect.left - borderLeft) * scaleX;
    if (document.body.classList.contains("flip-x")) {
      x = this.canvas.width - x;
    }
    return {
      x,
      y: (clientY - rect.top - borderTop) * scaleY,
    };
  }

  private shouldIgnorePointerTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("button, input, textarea, select, dialog, label, a, [contenteditable='true'], .card-queue-container"));
  }

  private cancelStroke(): void {
    this.isDrawing = false;
    this.clearDrawingTimer();
  }

  private startDrawing(e: PointerEvent): void {
    if (this.inputLocked) return;
    if (e.button !== 0) return;
    if (this.inputCalibration && this.shouldIgnorePointerTarget(e.target)) return;
    if (this.hasInputCalibration) e.preventDefault();

    const pos = this.getCanvasPoint(e.clientX, e.clientY);
    if (!pos) {
      return;
    }

    this.isDrawing = true;
    this.hasDrawn = false;
    this.dispatched = false;
    this.resetTimer();
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastW = this.MAX_W;
    this.lastDX = 0;
    this.lastDY = 0;
    this.lastV = 0;
  }

  private draw(e: PointerEvent): void {
    if (this.inputLocked) return;
    if (!this.isDrawing) return;
    this.resetTimer();
    const pos = this.getCanvasPoint(e.clientX, e.clientY);
    if (!pos) {
      return;
    }

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
    if (this.lastV > 5) {
      let flickX = this.lastX;
      let flickY = this.lastY;
      let flickW = this.lastW;

      const vx = this.lastDX / this.lastV;
      const vy = this.lastDY / this.lastV;
      let speed = this.lastV * 0.2;

      for (let i = 0; i < 15; i++) {
        const nextX = flickX + vx * speed;
        const nextY = flickY + vy * speed;
        const nextW = flickW * 0.8;

        this.ctx.beginPath();
        this.ctx.lineWidth = nextW;
        this.ctx.moveTo(flickX, flickY);
        this.ctx.lineTo(nextX, nextY);
        this.ctx.stroke();

        flickX = nextX;
        flickY = nextY;
        flickW = nextW;
        speed *= 0.8;
        if (flickW < 0.2) break;
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
