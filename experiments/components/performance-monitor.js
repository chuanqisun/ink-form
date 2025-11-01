export class PerformanceMonitor {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 60; // Number of frames to average
    this.frameIntervals = [];
    this.lastFrameTime = performance.now();
    this.onFpsUpdate = options.onFpsUpdate || (() => {});
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

  calculateFps() {
    if (this.frameIntervals.length === 0) return 0;
    const avgInterval = this.frameIntervals.reduce((a, b) => a + b, 0) / this.frameIntervals.length;
    return Math.round(1000 / avgInterval);
  }

  reset() {
    this.frameIntervals = [];
    this.lastFrameTime = performance.now();
  }
}
