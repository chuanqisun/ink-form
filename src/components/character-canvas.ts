export class CharacterCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private density: Float32Array | null = null;
  private tempBuffer: Float32Array | null = null;
  private isDrying = false;

  private readonly DIFFUSION_RATE = 0.4;
  private readonly DECAY_RATE = 0.997;
  private readonly RENDER_THRESHOLD = 0.05;

  private static noiseMap: Float32Array | null = null;

  static createElement(canvasId: string): HTMLCanvasElement {
    const charCanvas = document.createElement("canvas");
    charCanvas.id = canvasId;
    charCanvas.classList.add("character-canvas");
    charCanvas.width = 720;
    charCanvas.height = 1280;

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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        resolve();
      };
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });
  }

  private static getNoiseMap(w: number, h: number): Float32Array {
    if (this.noiseMap && this.noiseMap.length === w * h) {
      return this.noiseMap;
    }
    const noise = new Float32Array(w * h);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = Math.random();
    }
    const tempNoise = new Float32Array(w * h);
    for (let pass = 0; pass < 5; pass++) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          tempNoise[idx] = (noise[idx - 1] + noise[idx + 1] + noise[idx - w] + noise[idx + w]) * 0.25;
        }
      }
      noise.set(tempNoise);
    }
    this.noiseMap = noise;
    return noise;
  }

  async startDrying(boundingBox?: { x: number; y: number; width: number; height: number }) {
    if (this.isDrying) return;
    this.isDrying = true;

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Allow ink to "settle"

    const w = this.canvas.width;
    const h = this.canvas.height;
    const imageData = this.ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    this.density = new Float32Array(w * h);
    this.tempBuffer = new Float32Array(w * h);

    if (boundingBox) {
      const xMin = Math.max(0, Math.floor(boundingBox.x - 10));
      const xMax = Math.min(w, Math.ceil(boundingBox.x + boundingBox.width + 10));
      const yMin = Math.max(0, Math.floor(boundingBox.y - 10));
      const yMax = Math.min(h, Math.ceil(boundingBox.y + boundingBox.height + 10));

      for (let y = yMin; y < yMax; y++) {
        for (let x = xMin; x < xMax; x++) {
          const idx = y * w + x;
          this.density[idx] = data[idx * 4 + 3] / 255;
        }
      }
    } else {
      for (let i = 0; i < w * h; i++) {
        this.density[i] = data[i * 4 + 3] / 255;
      }
    }

    this.dryingLoop(boundingBox);
  }

  private dryingLoop(boundingBox?: { x: number; y: number; width: number; height: number }) {
    if (!this.isDrying || !this.density || !this.tempBuffer) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const noiseMap = CharacterCanvas.getNoiseMap(w, h);

    const xMin = boundingBox ? Math.max(1, Math.floor(boundingBox.x - 20)) : 1;
    const xMax = boundingBox ? Math.min(w - 2, Math.ceil(boundingBox.x + boundingBox.width + 20)) : w - 2;
    const yMin = boundingBox ? Math.max(1, Math.floor(boundingBox.y - 20)) : 1;
    const yMax = boundingBox ? Math.min(h - 2, Math.ceil(boundingBox.y + boundingBox.height + 20)) : h - 2;

    let hasInk = false;

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const idx = y * w + x;
        const d = this.density[idx];

        // Optimization: skip areas with no ink
        if (d < 0.001 && this.density[idx - 1] < 0.001 && this.density[idx + 1] < 0.001 && this.density[idx - w] < 0.001 && this.density[idx + w] < 0.001) {
          this.tempBuffer[idx] = 0;
          continue;
        }

        const neighbors = (this.density[idx - 1] + this.density[idx + 1] + this.density[idx - w] + this.density[idx + w]) * 0.25;
        let val = d * (1 - this.DIFFUSION_RATE) + neighbors * this.DIFFUSION_RATE;
        const localDecay = this.DECAY_RATE - noiseMap[idx] * 0.003;
        const newVal = val * localDecay;
        this.tempBuffer[idx] = newVal;

        if (newVal > 0.005) hasInk = true;
      }
    }

    this.density.set(this.tempBuffer);
    this.renderArea(xMin, yMin, xMax - xMin + 1, yMax - yMin + 1);

    if (hasInk) {
      requestAnimationFrame(() => this.dryingLoop(boundingBox));
    } else {
      this.isDrying = false;
      this.destroy();
    }
  }

  private renderArea(x: number, y: number, width: number, height: number) {
    if (!this.density) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const noiseMap = CharacterCanvas.getNoiseMap(w, h);

    const imgData = this.ctx.getImageData(x, y, width, height);
    const data = imgData.data;

    for (let ly = 0; ly < height; ly++) {
      for (let lx = 0; lx < width; lx++) {
        const gx = x + lx;
        const gy = y + ly;
        const gIdx = gy * w + gx;
        const lIdx = (ly * width + lx) * 4;

        const d = this.density[gIdx];
        const localThreshold = this.RENDER_THRESHOLD + noiseMap[gIdx] * 0.04;

        let alpha = 0;
        if (d > localThreshold) {
          alpha = Math.min(1, (d - localThreshold) / (1 - localThreshold));
          alpha = Math.pow(alpha, 0.6);
        }

        data[lIdx] = 0;
        data[lIdx + 1] = 0;
        data[lIdx + 2] = 0;
        data[lIdx + 3] = alpha * 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  clear() {
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.canvas.remove();
  }
}
