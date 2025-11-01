interface PerformanceMonitorOptions {
  windowSize?: number;
  onFpsUpdate?: (fps: number) => void;
}

export class PerformanceMonitor {
  private readonly windowSize: number;
  private frameIntervals: number[] = [];
  private lastFrameTime: number;
  private readonly onFpsUpdate: (fps: number) => void;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.windowSize = options.windowSize ?? 60; // Number of frames to average
    this.lastFrameTime = performance.now();
    this.onFpsUpdate = options.onFpsUpdate ?? (() => {});
  }

  tick() {
    const currentTime = performance.now();
    const frameInterval = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    this.frameIntervals.push(frameInterval);
    if (this.frameIntervals.length > this.windowSize) {
      this.frameIntervals.shift();
    }

    const fps = this.calculateFps();
    this.onFpsUpdate(fps);
    return fps;
  }

  private calculateFps(): number {
    if (this.frameIntervals.length === 0) return 0;
    const avgInterval = this.frameIntervals.reduce((a, b) => a + b, 0) / this.frameIntervals.length;
    return Math.round(1000 / avgInterval);
  }

  reset() {
    this.frameIntervals = [];
    this.lastFrameTime = performance.now();
  }
}
