type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
  };

export interface CanvasSequenceExporterStatus {
  directoryName: string | null;
  isReady: boolean;
  message: string;
  nextSequenceNumber: number;
  sequenceTimestamp: string | null;
  supportsDirectoryPicker: boolean;
}

export interface CanvasSequenceExporterOptions {
  extension?: "png";
  filenamePadding?: number;
}

export class CanvasSequenceExporter extends EventTarget {
  private readonly extension: "png";
  private readonly filenamePadding: number;
  private readonly canvas: HTMLCanvasElement;
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private sequenceTimestamp: string | null = null;
  private nextSequenceNumber = 0;
  private pendingWrite: Promise<unknown> = Promise.resolve();

  constructor(canvas: HTMLCanvasElement, options: CanvasSequenceExporterOptions = {}) {
    super();
    this.canvas = canvas;
    this.extension = options.extension ?? "png";
    this.filenamePadding = options.filenamePadding ?? 4;
    this.emitStatus(this.supportsDirectoryPicker ? "Choose an export directory" : "Export unavailable in this browser");
  }

  get supportsDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
  }

  get status(): CanvasSequenceExporterStatus {
    return {
      directoryName: this.directoryHandle?.name ?? null,
      isReady: this.directoryHandle !== null,
      message: this.directoryHandle
        ? `Exporting to ${this.directoryHandle.name}`
        : this.supportsDirectoryPicker
        ? "Choose an export directory"
        : "Export unavailable in this browser",
      nextSequenceNumber: this.nextSequenceNumber,
      sequenceTimestamp: this.sequenceTimestamp,
      supportsDirectoryPicker: this.supportsDirectoryPicker,
    };
  }

  async pickDirectory(): Promise<boolean> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      this.emitStatus("Export unavailable in this browser");
      return false;
    }

    try {
      this.directoryHandle = await picker.call(window, { mode: "readwrite", id: "ink-form-render-export" });
      this.emitStatus(`Exporting to ${this.directoryHandle.name}`);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.emitStatus(this.directoryHandle ? `Exporting to ${this.directoryHandle.name}` : "Export skipped");
        return false;
      }

      console.error("Failed to choose export directory:", error);
      this.emitStatus("Export directory selection failed");
      return false;
    }
  }

  async startSequence(options: { captureCurrentFrame?: boolean } = {}): Promise<boolean> {
    const { captureCurrentFrame = true } = options;

    return this.enqueue(async () => {
      this.sequenceTimestamp = `${Date.now()}`;
      this.nextSequenceNumber = 0;

      if (!this.directoryHandle) {
        this.emitStatus(this.supportsDirectoryPicker ? "Export disabled" : "Export unavailable in this browser");
        return false;
      }

      this.emitStatus(`Sequence ${this.sequenceTimestamp} ready`);
      if (!captureCurrentFrame) {
        return true;
      }

      return this.writeCurrentFrame();
    });
  }

  async captureFrame(): Promise<boolean> {
    return this.enqueue(async () => this.writeCurrentFrame());
  }

  private async writeCurrentFrame(): Promise<boolean> {
    if (!this.directoryHandle) {
      this.emitStatus(this.supportsDirectoryPicker ? "Export disabled" : "Export unavailable in this browser");
      return false;
    }

    if (!this.sequenceTimestamp) {
      this.sequenceTimestamp = `${Date.now()}`;
      this.nextSequenceNumber = 0;
    }

    const sequenceNumber = String(this.nextSequenceNumber).padStart(this.filenamePadding, "0");
    const fileName = `${this.sequenceTimestamp}-${sequenceNumber}.${this.extension}`;
    const blob = await this.createBlob();
    const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    await writable.write(blob);
    await writable.close();

    this.nextSequenceNumber += 1;
    this.emitStatus(`Saved ${fileName}`);
    return true;
  }

  private async createBlob(): Promise<Blob> {
    const composedCanvas = document.createElement("canvas");
    composedCanvas.width = this.canvas.width;
    composedCanvas.height = this.canvas.height;

    const ctx = composedCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create export canvas context");
    }

    ctx.fillStyle = this.resolveBackgroundColor();
    ctx.fillRect(0, 0, composedCanvas.width, composedCanvas.height);
    ctx.drawImage(this.canvas, 0, 0);

    return new Promise((resolve, reject) => {
      composedCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Unable to serialize canvas export"));
      }, "image/png");
    });
  }

  private resolveBackgroundColor(): string {
    const backgroundColor = window.getComputedStyle(this.canvas).backgroundColor;
    return backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" ? backgroundColor : "#ffffff";
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.pendingWrite.then(task, task);
    this.pendingWrite = nextTask.then(
      () => undefined,
      () => undefined
    );
    return nextTask;
  }

  private emitStatus(message: string): void {
    this.dispatchEvent(
      new CustomEvent<CanvasSequenceExporterStatus>("statuschange", {
        detail: {
          directoryName: this.directoryHandle?.name ?? null,
          isReady: this.directoryHandle !== null,
          message,
          nextSequenceNumber: this.nextSequenceNumber,
          sequenceTimestamp: this.sequenceTimestamp,
          supportsDirectoryPicker: this.supportsDirectoryPicker,
        },
      })
    );
  }
}
