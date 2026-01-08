# Ink Drying effects

To achieve the "Perlin-like island" effect and uneven drying, we will generate a **static noise map** at startup. This map represents the natural variation in paper texture and absorbency.

### The Logic:

1.  **Noise Map**: We create a "cloudy" noise field by filling a buffer with random values and applying multiple blur passes. This creates smooth gradients of "high" and "low" absorbency areas.
2.  **Modulated Decay**: During the simulation, each pixel's `DECAY_RATE` is slightly adjusted by the noise map. "Thirsty" parts of the paper absorb ink faster.
3.  **Modulated Threshold**: In the rendering phase, the `RENDER_THRESHOLD` is also influenced by the noise. This causes the ink to "recede" into islands and clumps as it disappears, rather than just fading out uniformly.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Calligraphy Ink Diffusion - Island Effect</title>
    <style>
      body {
        margin: 0;
        background: #dcd3c1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        font-family: "PingFang SC", "Microsoft YaHei", serif;
      }
      canvas {
        background: #f4f1e8;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        cursor: crosshair;
        border: 1px solid #b5a68d;
        image-rendering: pixelated;
      }
      .controls {
        margin-top: 20px;
        color: #5d5446;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <canvas id="canvas"></canvas>
    <div class="controls">Hold mouse to write. Ink will dry unevenly into islands over 8+ seconds.</div>

    <script>
      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });

      const W = 600;
      const H = 400;
      canvas.width = W;
      canvas.height = H;

      let density = new Float32Array(W * H);
      let tempBuffer = new Float32Array(W * H);
      let noiseMap = new Float32Array(W * H);

      let isDrawing = false;
      let lastX = 0,
        lastY = 0;
      let idleTimer = null;
      let isDissolving = false;

      // Simulation Constants (Kept from previous version)
      const BRUSH_RADIUS = 6;
      const DIFFUSION_RATE = 0.4;
      const DECAY_RATE = 0.997;
      const RENDER_THRESHOLD = 0.05;

      // --- Noise Generation (Perlin-like via blurred white noise) ---
      function generateNoise() {
        // 1. Fill with white noise
        for (let i = 0; i < noiseMap.length; i++) {
          noiseMap[i] = Math.random();
        }
        // 2. Simple Box Blur passes to create "clouds"
        for (let pass = 0; pass < 5; pass++) {
          let tempNoise = new Float32Array(W * H);
          for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
              const idx = y * W + x;
              tempNoise[idx] = (noiseMap[idx - 1] + noiseMap[idx + 1] + noiseMap[idx - W] + noiseMap[idx + W]) * 0.25;
            }
          }
          noiseMap.set(tempNoise);
        }
      }
      generateNoise();

      function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.floor(e.clientX - rect.left),
          y: Math.floor(e.clientY - rect.top),
        };
      }

      function drawLine(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(dist, 1);
        for (let i = 0; i <= steps; i++) {
          const x = x1 + (x2 - x1) * (i / steps);
          const y = y1 + (y2 - y1) * (i / steps);
          stampInk(x, y);
        }
      }

      function stampInk(cx, cy) {
        const r = BRUSH_RADIUS;
        for (let y = -r; y <= r; y++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + y * y <= r * r) {
              const px = Math.floor(cx + x);
              const py = Math.floor(cy + y);
              if (px >= 0 && px < W && py >= 0 && py < H) {
                density[py * W + px] = 1.0;
              }
            }
          }
        }
      }

      canvas.onmousedown = (e) => {
        isDrawing = true;
        isDissolving = false;
        clearTimeout(idleTimer);
        const pos = getMousePos(e);
        [lastX, lastY] = [pos.x, pos.y];
        stampInk(pos.x, pos.y);
        render();
      };

      window.onmousemove = (e) => {
        if (!isDrawing) return;
        const pos = getMousePos(e);
        drawLine(lastX, lastY, pos.x, pos.y);
        [lastX, lastY] = [pos.x, pos.y];
        render();
      };

      window.onmouseup = () => {
        if (!isDrawing) return;
        isDrawing = false;
        idleTimer = setTimeout(() => {
          isDissolving = true;
          requestAnimationFrame(simulate);
        }, 1000);
      };

      function simulate() {
        if (!isDissolving) return;

        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            const idx = y * W + x;

            const neighbors = (density[idx - 1] + density[idx + 1] + density[idx - W] + density[idx + W]) * 0.25;

            let val = density[idx] * (1 - DIFFUSION_RATE) + neighbors * DIFFUSION_RATE;

            // Apply slight randomness to decay based on noise map
            // Some pixels dry slightly faster (0.995) vs slower (0.998)
            const localDecay = DECAY_RATE - noiseMap[idx] * 0.003;
            tempBuffer[idx] = val * localDecay;
          }
        }

        density.set(tempBuffer);
        render();

        let hasInk = false;
        for (let i = 0; i < density.length; i += 200) {
          if (density[i] > 0.005) {
            hasInk = true;
            break;
          }
        }

        if (hasInk) {
          requestAnimationFrame(simulate);
        } else {
          isDissolving = false;
          density.fill(0);
          render();
        }
      }

      function render() {
        const imgData = ctx.createImageData(W, H);
        const data = imgData.data;
        const paperR = 244,
          paperG = 241,
          paperB = 232;

        for (let i = 0; i < density.length; i++) {
          const d = density[i];
          const outIdx = i * 4;

          // Modulate threshold with noise to create "islands" as it recedes
          const localThreshold = RENDER_THRESHOLD + noiseMap[i] * 0.04;

          let alpha = 0;
          if (d > localThreshold) {
            alpha = Math.min(1, (d - localThreshold) / (1 - localThreshold));
            alpha = Math.pow(alpha, 0.6);
          }

          data[outIdx] = 0 * alpha + paperR * (1 - alpha);
          data[outIdx + 1] = 0 * alpha + paperG * (1 - alpha);
          data[outIdx + 2] = 0 * alpha + paperB * (1 - alpha);
          data[outIdx + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      render();
    </script>
  </body>
</html>
```
