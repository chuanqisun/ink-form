# Chinese Brush effect

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Continuous Calligraphy Brush</title>
    <style>
      body {
        margin: 0;
        background: #f0ede5;
        overflow: hidden;
        cursor: crosshair;
      }
      canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <canvas id="canvas"></canvas>

    <script>
      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d");

      // --- Settings ---
      const MAX_W = 18; // Max thickness (slow)
      const MIN_W = 1.5; // Min thickness (fast)
      const SPEED_LIMIT = 40; // Speed at which we hit MIN_W
      const LERP_SPEED = 0.15; // Smooths the width transition

      let isDrawing = false;
      let lastX,
        lastY,
        lastW = MAX_W;
      let lastDX = 0,
        lastDY = 0;
      let lastV = 0;

      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Set global line styles for maximum smoothness
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "black";
        ctx.fillStyle = "black";
      }
      window.addEventListener("resize", resize);
      resize();

      function getPos(e) {
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX, y: t.clientY };
      }

      function start(e) {
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        lastW = MAX_W;
      }

      function move(e) {
        if (!isDrawing) return;
        const pos = getPos(e);

        const dx = pos.x - lastX;
        const dy = pos.y - lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 1. Calculate the target width based on speed
        const targetW = Math.max(MIN_W, MAX_W - (dist / SPEED_LIMIT) * (MAX_W - MIN_W));

        // 2. Sub-segmenting: Bridge the gap between mouse events
        // We draw a line every 2 pixels to ensure the width tapers smoothly
        const steps = Math.max(1, Math.ceil(dist / 2));

        let currentX = lastX;
        let currentY = lastY;
        let currentW = lastW;

        for (let i = 1; i <= steps; i++) {
          const t = i / steps;

          // Interpolate position
          const nextX = lastX + dx * t;
          const nextY = lastY + dy * t;

          // Interpolate width (Lerp from last width to target width)
          const nextW = lastW + (targetW - lastW) * (i / steps) * LERP_SPEED;

          ctx.beginPath();
          ctx.lineWidth = nextW;
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(nextX, nextY);
          ctx.stroke();

          currentX = nextX;
          currentY = nextY;
          currentW = nextW;
        }

        // Store state for next frame
        lastDX = dx;
        lastDY = dy;
        lastV = dist;
        lastX = pos.x;
        lastY = pos.y;
        lastW = currentW;
      }

      function end() {
        if (!isDrawing) return;

        // 3. The "Flick" (Sharp Ending)
        // If moving fast when released, continue the line while tapering to zero
        if (lastV > 6) {
          let flickX = lastX;
          let flickY = lastY;
          let flickW = lastW;

          for (let i = 0; i < 10; i++) {
            const nextX = flickX + lastDX * 0.15;
            const nextY = flickY + lastDY * 0.15;
            const nextW = flickW * 0.75;

            ctx.beginPath();
            ctx.lineWidth = nextW;
            ctx.moveTo(flickX, flickY);
            ctx.lineTo(nextX, nextY);
            ctx.stroke();

            flickX = nextX;
            flickY = nextY;
            flickW = nextW;
            if (flickW < 0.5) break;
          }
        }

        isDrawing = false;
      }

      // Event Listeners
      canvas.addEventListener("mousedown", start);
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);

      canvas.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          start(e);
        },
        { passive: false }
      );
      canvas.addEventListener(
        "touchmove",
        (e) => {
          e.preventDefault();
          move(e);
        },
        { passive: false }
      );
      canvas.addEventListener("touchend", end);
    </script>
  </body>
</html>
```
