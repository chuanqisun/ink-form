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

interface PersistedCalibration {
  version: 1;
  transform: HomographyMatrix;
  flipXAtCalibration: boolean;
}

const CALIBRATION_CSS_CLASS = "calibrating";
const DEBUG_CSS_CLASS = "input-debug";
const VIEWPORT_POINTER_TARGET = "window" as const;
const DEFAULT_POINTER_IGNORE_SELECTOR = "button, input, textarea, select, dialog, label, a, [contenteditable='true'], .card-queue-container";
const CALIBRATION_STORAGE_KEY = "ink-form.input-calibration";
const POST_CALIBRATION_COOLDOWN_MS = 1000;
const CALIBRATION_INPUT_GAP_MS = 500;
const SHIFT_KEY = "Shift";

const CALIBRATION_TARGET_LAYOUT = Object.freeze([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);

const CALIBRATION_TARGET_STYLE = Object.freeze({
  insetRatio: 0.08,
  radiusPx: 18,
  strokeWidthPx: 4,
  fillColor: "#ff3b30",
  strokeColor: "#ffffff",
});

const DEBUG_INDICATOR_STYLE = Object.freeze({
  radiusPx: 10,
  fillColor: "rgba(255, 59, 48, 0.9)",
  strokeColor: "rgba(255, 255, 255, 0.95)",
  strokeWidthPx: 2,
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

function parsePersistedCalibration(rawValue: string | null): PersistedCalibration | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedCalibration>;
    if (parsed.version !== 1 || !Array.isArray(parsed.transform) || parsed.transform.length !== 9 || typeof parsed.flipXAtCalibration !== "boolean") {
      return null;
    }

    const transform = parsed.transform.map((value) => Number(value));
    if (transform.some((value) => !Number.isFinite(value))) {
      return null;
    }

    return {
      version: 1,
      transform: transform as HomographyMatrix,
      flipXAtCalibration: parsed.flipXAtCalibration,
    };
  } catch {
    return null;
  }
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

  renderIndicator(point: Point): void {
    this.clear();
    this.context.save();
    this.context.fillStyle = DEBUG_INDICATOR_STYLE.fillColor;
    this.context.strokeStyle = DEBUG_INDICATOR_STYLE.strokeColor;
    this.context.lineWidth = DEBUG_INDICATOR_STYLE.strokeWidthPx;
    this.context.beginPath();
    this.context.arc(point.x, point.y, DEBUG_INDICATOR_STYLE.radiusPx, 0, Math.PI * 2);
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
  private pendingInputSuppressionCleanup: (() => void) | null = null;
  private postCalibrationUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  private isShiftHeld = false;
  private debugPointer: Point | null = null;
  private lastClientPointer: Point | null = null;

  private readonly handleTriggerClick = () => {
    void this.startCalibration();
  };
  private readonly handleWindowPointerMove = (event: PointerEvent) => {
    this.lastClientPointer = { x: event.clientX, y: event.clientY };
    this.updateDebugPointer(this.lastClientPointer);
  };
  private readonly handleWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== SHIFT_KEY) {
      return;
    }

    this.isShiftHeld = true;
    if (this.lastClientPointer) {
      this.updateDebugPointer(this.lastClientPointer);
      return;
    }

    this.render();
  };
  private readonly handleWindowKeyUp = (event: KeyboardEvent) => {
    if (event.key !== SHIFT_KEY) {
      return;
    }

    this.isShiftHeld = false;
    this.debugPointer = null;
    this.render();
  };
  private readonly handleWindowBlur = () => {
    this.isShiftHeld = false;
    this.debugPointer = null;
    this.render();
  };

  constructor(options: InputCalibrationControllerOptions) {
    this.drawingCanvas = options.drawingCanvas;
    this.canvasStack = options.canvasStack;
    this.triggerButton = options.triggerButton;
    this.overlay = new CalibrationOverlay(options.overlayCanvas);
    this.onStateChange = options.onStateChange;

    this.triggerButton.addEventListener("click", this.handleTriggerClick);
    window.addEventListener("pointermove", this.handleWindowPointerMove);
    window.addEventListener("keydown", this.handleWindowKeyDown);
    window.addEventListener("keyup", this.handleWindowKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);

    this.restorePersistedCalibration();
    this.render();
  }

  destroy(): void {
    this.triggerButton.removeEventListener("click", this.handleTriggerClick);
    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    window.removeEventListener("keydown", this.handleWindowKeyDown);
    window.removeEventListener("keyup", this.handleWindowKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.clearPendingPointerCapture();
    this.clearPendingInputSuppression();
    this.clearPostCalibrationCooldown();
    this.overlay.clear();
  }

  private get hasCalibration(): boolean {
    return this.calibrationTransform !== null;
  }

  private render(): void {
    this.canvasStack.classList.toggle(CALIBRATION_CSS_CLASS, this.isCalibrating);
    this.canvasStack.classList.toggle(DEBUG_CSS_CLASS, this.shouldShowDebugIndicator());
    this.triggerButton.disabled = this.isCalibrating;
    this.triggerButton.textContent = this.getButtonLabel();

    if (this.isCalibrating && this.currentStepIndex >= 0) {
      this.overlay.renderTarget(this.currentTargets[this.currentStepIndex]);
    } else if (this.shouldShowDebugIndicator() && this.debugPointer) {
      this.overlay.renderIndicator(this.debugPointer);
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

  private shouldShowDebugIndicator(): boolean {
    return !this.isCalibrating && this.isShiftHeld && this.hasCalibration && this.debugPointer !== null;
  }

  private restorePersistedCalibration(): void {
    const persisted = parsePersistedCalibration(window.localStorage.getItem(CALIBRATION_STORAGE_KEY));
    if (!persisted) {
      return;
    }

    this.calibrationTransform = persisted.transform;
    this.flipXAtCalibration = persisted.flipXAtCalibration;
    this.drawingCanvas.setInputAdapter(this.createInputAdapter());
  }

  private persistCalibration(): void {
    if (!this.calibrationTransform) {
      window.localStorage.removeItem(CALIBRATION_STORAGE_KEY);
      return;
    }

    const payload: PersistedCalibration = {
      version: 1,
      transform: this.calibrationTransform,
      flipXAtCalibration: this.flipXAtCalibration,
    };
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(payload));
  }

  private beginPostCalibrationCooldown(): void {
    this.clearPostCalibrationCooldown();
    this.drawingCanvas.setInteractionLocked(true);
    this.postCalibrationUnlockTimer = setTimeout(() => {
      this.postCalibrationUnlockTimer = null;
      if (!this.isCalibrating) {
        this.drawingCanvas.setInteractionLocked(false);
      }
    }, POST_CALIBRATION_COOLDOWN_MS);
  }

  private clearPostCalibrationCooldown(): void {
    if (!this.postCalibrationUnlockTimer) {
      return;
    }

    clearTimeout(this.postCalibrationUnlockTimer);
    this.postCalibrationUnlockTimer = null;
  }

  private updateDebugPointer(clientPoint: Point): void {
    if (!this.isShiftHeld || !this.hasCalibration) {
      if (this.debugPointer === null) {
        return;
      }

      this.debugPointer = null;
      this.render();
      return;
    }

    const adapter = this.createInputAdapter();
    if (!adapter) {
      this.debugPointer = null;
      this.render();
      return;
    }

    const mappedPoint = adapter.mapClientPoint(clientPoint, this.drawingCanvas.element);
    if (mappedPoint?.x === this.debugPointer?.x && mappedPoint?.y === this.debugPointer?.y) {
      return;
    }

    this.debugPointer = mappedPoint;
    this.render();
  }

  private async startCalibration(): Promise<void> {
    if (this.isCalibrating) {
      return;
    }

    this.clearPostCalibrationCooldown();
    this.isCalibrating = true;
    this.debugPointer = null;
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
      this.persistCalibration();
      this.drawingCanvas.setInputAdapter(this.createInputAdapter());
    } catch (error) {
      console.error("Calibration failed:", error);
    } finally {
      this.clearPendingPointerCapture();
      this.isCalibrating = false;
      this.currentStepIndex = -1;
      this.currentTargets = [];
      this.beginPostCalibrationCooldown();
      this.render();
    }
  }

  private async captureViewportPoints(): Promise<Point[]> {
    const capturedPoints: Point[] = [];

    for (let index = 0; index < this.currentTargets.length; index += 1) {
      this.currentStepIndex = index;
      this.render();
      capturedPoints.push(await this.waitForViewportPointerDown());

      if (index < this.currentTargets.length - 1) {
        await this.waitForCalibrationInputGap();
      }
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

  private async waitForCalibrationInputGap(): Promise<void> {
    this.clearPendingInputSuppression();

    await new Promise<void>((resolve) => {
      const suppressEvent = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      const cleanup = () => {
        window.removeEventListener("pointerdown", suppressEvent, true);
        window.removeEventListener("pointerup", suppressEvent, true);
        window.removeEventListener("click", suppressEvent, true);
        window.removeEventListener("keydown", suppressEvent, true);
        window.removeEventListener("keyup", suppressEvent, true);
        if (this.pendingInputSuppressionCleanup === cleanup) {
          this.pendingInputSuppressionCleanup = null;
        }
      };

      this.pendingInputSuppressionCleanup = cleanup;
      window.addEventListener("pointerdown", suppressEvent, { capture: true, passive: false });
      window.addEventListener("pointerup", suppressEvent, { capture: true, passive: false });
      window.addEventListener("click", suppressEvent, { capture: true, passive: false });
      window.addEventListener("keydown", suppressEvent, { capture: true, passive: false });
      window.addEventListener("keyup", suppressEvent, { capture: true, passive: false });

      window.setTimeout(() => {
        cleanup();
        resolve();
      }, CALIBRATION_INPUT_GAP_MS);
    });
  }

  private clearPendingInputSuppression(): void {
    this.pendingInputSuppressionCleanup?.();
    this.pendingInputSuppressionCleanup = null;
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
