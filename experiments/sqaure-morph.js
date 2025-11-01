import { ParticleSystem } from "./components/particle-system.js";
import { PerformanceMonitor } from "./components/performance-monitor.js";

// Application
class Application {
  constructor(canvas, button, fpsDisplay) {
    this.canvas = canvas;
    this.squareSize = 400;
    this.squareX = canvas.width / 2 - this.squareSize / 2;
    this.squareY = canvas.height / 2 - this.squareSize / 2;
    this.button = button;

    try {
      this.particleSystem = new ParticleSystem(canvas);
    } catch (e) {
      alert("WebGL2 not supported: " + e.message);
      throw e;
    }

    this.animating = false;
    this.animationId = null;

    // Performance monitoring with callback
    this.performanceMonitor = new PerformanceMonitor({
      windowSize: 60,
      onFpsUpdate: (fps) => {
        fpsDisplay.textContent = fps;
      },
    });

    // Bind button
    this.button.addEventListener("click", () => this.start());

    this.reset();
  }

  reset() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.animating = false;
    this.button.disabled = false;

    // Draw initial state
    this.particleSystem.clear();
    this.particleSystem.drawSquare(this.squareX, this.squareY, this.squareSize, { r: 0, g: 0, b: 0, a: 1 });
  }

  start() {
    if (this.animating) return;

    this.animating = true;
    this.button.disabled = true;

    this.particleSystem.createSquare(this.squareX, this.squareY, this.squareSize);
    this.animate();
  }

  animate() {
    // Both update and render now run on GPU!
    this.particleSystem.update();
    this.particleSystem.render({ r: 0, g: 0, b: 0, a: 1 });

    // Track performance
    this.performanceMonitor.tick();

    if (this.animating) {
      this.animationId = requestAnimationFrame(() => this.animate());
    }
  }
}

// Initialize application
const canvas = document.getElementById("canvas");
const button = document.getElementById("play");
const fpsDisplay = document.getElementById("fps");
const app = new Application(canvas, button, fpsDisplay);
