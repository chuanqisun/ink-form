export interface CanvasHistoryTarget {
  readImage(): ImageData;
  writeImage(data: ImageData): void;
}

export interface CanvasHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export interface CanvasHistoryOptions {
  maxEntries?: number;
}

const cloneImageData = (image: ImageData): ImageData => new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);

export class CanvasHistory extends EventTarget {
  private readonly maxEntries: number;
  private readonly target: CanvasHistoryTarget;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private currentEntry: ImageData;

  constructor(target: CanvasHistoryTarget, options: CanvasHistoryOptions = {}) {
    super();
    this.target = target;
    this.maxEntries = options.maxEntries ?? 50;
    this.currentEntry = cloneImageData(this.target.readImage());
    this.emitChange();
  }

  get state(): CanvasHistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    };
  }

  capture(): void {
    this.undoStack.push(this.currentEntry);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.splice(0, this.undoStack.length - this.maxEntries);
    }
    this.currentEntry = cloneImageData(this.target.readImage());
    this.redoStack = [];
    this.emitChange();
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentEntry = cloneImageData(this.target.readImage());
    this.emitChange();
  }

  undo(): boolean {
    const previousEntry = this.undoStack.pop();
    if (!previousEntry) {
      return false;
    }

    this.redoStack.push(this.currentEntry);
    this.currentEntry = cloneImageData(previousEntry);
    this.target.writeImage(cloneImageData(previousEntry));
    this.emitChange();
    return true;
  }

  redo(): boolean {
    const nextEntry = this.redoStack.pop();
    if (!nextEntry) {
      return false;
    }

    this.undoStack.push(this.currentEntry);
    this.currentEntry = cloneImageData(nextEntry);
    this.target.writeImage(cloneImageData(nextEntry));
    this.emitChange();
    return true;
  }

  private emitChange(): void {
    this.dispatchEvent(new CustomEvent<CanvasHistoryState>("change", { detail: this.state }));
  }
}
