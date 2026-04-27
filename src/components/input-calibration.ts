import { DrawingCanvas, type DrawingInputAdapter } from "./draw-canvas";

export interface Point {
  x: number;
  y: number;
}

export interface InputCalibrationState {
  isCalibrating: boolean;
  hasCalibration: boolean;
  shouldAnchorCanvas: boolean;
}

interface InputCalibrationControllerOptions {
  drawingCanvas: DrawingCanvas;
  canvasStack: HTMLElement;
  overlayCanvas: HTMLCanvasElement;
  triggerButton: HTMLButtonElement;
  onStateChange?: (state: InputCalibrationState) => void;
}

type HomographyMatrix = [number, number, number, number, number, number, number, number, number];

const CALIBRATION_CSS_CLASS = "calibrating";
const VIEWPORT_POINTER_TARGET = "window" as const;
const DEFAULT_POINTER_IGNORE_SELECTOR = "button, input, textarea, select, dialog, label, a, [contenteditable='true'], .card-queue-container";

const CALIBRATION_TARGET_LAYOUT = Object.freeze([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);

const CALIBRATION_TARGET_STYLE = Object.freeze({
  insetRatio: 0.06,
  radiusPx: 18,
  strokeWidthPx: 4,
  fillColor: "#ff3b30",
  strokeColor: "#ffffff",
});

const CALIBRATION_BUTTON_LABELS = Object.freeze({
  idle: "Calibrate",
  ready: "Calibrate Again",
  active: (stepIndex: number, stepCount: number) => `Calibrating ${stepIndex + 1}/${stepCount}`,
});

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

function normalizeViewportPoint(point: Point): Point {
  return {
    x: point.x / Math.max(window.innerWidth, 1),
    y: point.y / Math.max(window.innerHeight, 1),
  };
}

function matchesIgnoredPointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest(DEFAULT_POINTER_IGNORE_SELECTOR));
}

class CalibrationOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d")!;
  }

  getTargetPoints(): Point[] {
    const { insetRatio } = CALIBRATION_TARGET_STYLE;
    const usableWidth = 1 - insetRatio * 2;
    const usableHeight = 1 - insetRatio * 2;

    return CALIBRATION_TARGET_LAYOUT.map(({ x, y }) => ({
      x: (insetRatio + x * usableWidth) * this.canvas.width,
      y: (insetRatio + y * usableHeight) * this.canvas.height,
    }));
  }

  normalizePoint(point: Point): Point {
    return {
      x: point.x / Math.max(this.canvas.width, 1),
      y: point.y / Math.max(this.canvas.height, 1),
    };
  }
  clear(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderTarget(point: Point): void {
    this.clear();
    this.context.save();
    this.context.fillStyle = CALIBRATION_TARGET_STYLE.fillColor;
    this.context.strokeStyle = CALIBRATION_TARGET_STYLE.strokeColor;
    this.context.lineWidth = CALIBRATION_TARGET_STYLE.strokeWidthPx;
    this.context.beginPath();
    this.context.arc(point.x, point.y, CALIBRATION_TARGET_STYLE.radiusPx, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }
}

export class InputCalibrationController {
  private readonly drawingCanvas: DrawingCanvas;
  private readonly canvasStack: HTMLElement;
  private readonly triggerButton: HTMLButtonElement;
  private readonly overlay: CalibrationOverlay;
  private readonly onStateChange?: (state: InputCalibrationState) => void;

  private isCalibrating = false;
  private currentStepIndex = -1;
  private currentTargets: Point[] = [];
  private calibrationTransform: HomographyMatrix | null = null;
  private flipXAtCalibration = false;
  private pendingPointerListenerCleanup: (() => void) | null = null;

  private readonly handleTriggerClick = () => {
    void this.startCalibration();
  };

  constructor(options: InputCalibrationControllerOptions) {
    this.drawingCanvas = options.drawingCanvas;
    this.canvasStack = options.canvasStack;
    this.triggerButton = options.triggerButton;
    this.overlay = new CalibrationOverlay(options.overlayCanvas);
    this.onStateChange = options.onStateChange;

    this.triggerButton.addEventListener("click", this.handleTriggerClick);
    this.render();
  }

  destroy(): void {
    this.triggerButton.removeEventListener("click", this.handleTriggerClick);
    this.clearPendingPointerCapture();
    this.overlay.clear();
  }

  private get hasCalibration(): boolean {
    return this.calibrationTransform !== null;
  }

  private render(): void {
    this.canvasStack.classList.toggle(CALIBRATION_CSS_CLASS, this.isCalibrating);
    this.triggerButton.disabled = this.isCalibrating;
    this.triggerButton.textContent = this.getButtonLabel();

    if (this.isCalibrating && this.currentStepIndex >= 0) {
      this.overlay.renderTarget(this.currentTargets[this.currentStepIndex]);
    } else {
      this.overlay.clear();
    }

    this.onStateChange?.({
      isCalibrating: this.isCalibrating,
      hasCalibration: this.hasCalibration,
      shouldAnchorCanvas: this.isCalibrating || this.hasCalibration,
    });
  }

  private getButtonLabel(): string {
    if (this.isCalibrating && this.currentStepIndex >= 0) {
      return CALIBRATION_BUTTON_LABELS.active(this.currentStepIndex, CALIBRATION_TARGET_LAYOUT.length);
    }

    return this.hasCalibration ? CALIBRATION_BUTTON_LABELS.ready : CALIBRATION_BUTTON_LABELS.idle;
  }

  private async startCalibration(): Promise<void> {
    if (this.isCalibrating) {
      return;
    }

    this.isCalibrating = true;
    this.currentTargets = this.overlay.getTargetPoints();
    this.currentStepIndex = 0;
    this.drawingCanvas.setInteractionLocked(true);
    this.render();

    try {
      const sourcePoints = await this.captureViewportPoints();
      const targetPoints = this.currentTargets.map((point) => this.overlay.normalizePoint(point));
      const nextTransform = computeHomography(sourcePoints, targetPoints);

      if (!nextTransform) {
        throw new Error("Unable to compute a stable calibration transform.");
      }

      this.calibrationTransform = nextTransform;
      this.flipXAtCalibration = document.body.classList.contains("flip-x");
      this.drawingCanvas.setInputAdapter(this.createInputAdapter());
    } catch (error) {
      console.error("Calibration failed:", error);
    } finally {
      this.clearPendingPointerCapture();
      this.isCalibrating = false;
      this.currentStepIndex = -1;
      this.currentTargets = [];
      this.drawingCanvas.setInteractionLocked(false);
      this.render();
    }
  }

  private async captureViewportPoints(): Promise<Point[]> {
    const capturedPoints: Point[] = [];

    for (let index = 0; index < this.currentTargets.length; index += 1) {
      this.currentStepIndex = index;
      this.render();
      capturedPoints.push(await this.waitForViewportPointerDown());
    }

    return capturedPoints;
  }

  private waitForViewportPointerDown(): Promise<Point> {
    return new Promise<Point>((resolve) => {
      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        cleanup();
        resolve(normalizeViewportPoint({ x: event.clientX, y: event.clientY }));
      };

      const cleanup = () => {
        window.removeEventListener("pointerdown", handlePointerDown, true);
        if (this.pendingPointerListenerCleanup === cleanup) {
          this.pendingPointerListenerCleanup = null;
        }
      };

      this.pendingPointerListenerCleanup = cleanup;
      window.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: false });
    });
  }

  private clearPendingPointerCapture(): void {
    this.pendingPointerListenerCleanup?.();
    this.pendingPointerListenerCleanup = null;
  }

  private createInputAdapter(): DrawingInputAdapter | null {
    if (!this.calibrationTransform) {
      return null;
    }

    return {
      eventTarget: VIEWPORT_POINTER_TARGET,
      preventDefault: true,
      shouldStart: (event: PointerEvent) => !matchesIgnoredPointerTarget(event.target),
      mapClientPoint: (clientPoint: Point, canvas: HTMLCanvasElement) => {
        if (!this.calibrationTransform) {
          return null;
        }

        const mappedPoint = applyHomography(this.calibrationTransform, normalizeViewportPoint(clientPoint));
        if (!mappedPoint) {
          return null;
        }

        let x = mappedPoint.x * canvas.width;
        if (document.body.classList.contains("flip-x") !== this.flipXAtCalibration) {
          x = canvas.width - x;
        }

        return {
          x: clamp(x, 0, canvas.width),
          y: clamp(mappedPoint.y * canvas.height, 0, canvas.height),
        };
      },
    };
  }
}
