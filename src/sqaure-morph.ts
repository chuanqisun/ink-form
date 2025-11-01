import { ParticleSystem } from "./components/particle-system";
import { PerformanceMonitor } from "./components/performance-monitor";

class Application {
  private readonly button: HTMLButtonElement;
  private readonly fpsDisplay: HTMLElement;
  private readonly particleSystem: ParticleSystem;
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly squareSize = 400;
  private readonly squareX: number;
  private readonly squareY: number;
  private animating = false;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement, button: HTMLButtonElement, fpsDisplay: HTMLElement) {
    this.button = button;
    this.fpsDisplay = fpsDisplay;
    this.squareX = canvas.width / 2 - this.squareSize / 2;
    this.squareY = canvas.height / 2 - this.squareSize / 2;

    try {
      this.particleSystem = new ParticleSystem(canvas);
    } catch (e) {
      alert("WebGL2 not supported: " + (e instanceof Error ? e.message : String(e)));
      throw e;
    }

    this.performanceMonitor = new PerformanceMonitor({
      windowSize: 60,
      onFpsUpdate: (fps) => {
        this.fpsDisplay.textContent = String(fps);
      },
    });

    this.button.addEventListener("click", () => this.start());

    this.reset();
  }

  private reset() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.animating = false;
    this.button.disabled = false;

    this.particleSystem.clear();
    this.particleSystem.drawSquare(this.squareX, this.squareY, this.squareSize, { r: 0, g: 0, b: 0, a: 1 });
  }

  private start() {
    if (this.animating) return;

    this.animating = true;
    this.button.disabled = true;

    this.particleSystem.createSquare(this.squareX, this.squareY, this.squareSize);
    this.animate();
  }

  private animate() {
    this.particleSystem.update();
    this.particleSystem.render({ r: 0, g: 0, b: 0, a: 1 });

    this.performanceMonitor.tick();

    if (this.animating) {
      this.animationId = requestAnimationFrame(() => this.animate());
    }
  }
}

const canvas = document.getElementById("canvas");
const button = document.getElementById("play");
const fpsDisplay = document.getElementById("fps");

if (canvas instanceof HTMLCanvasElement && button instanceof HTMLButtonElement && fpsDisplay) {
  new Application(canvas, button, fpsDisplay);
} else {
  throw new Error("Required DOM elements not found");
}
