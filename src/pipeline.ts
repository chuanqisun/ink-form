import {
  catchError,
  concatMap,
  defaultIfEmpty,
  EMPTY,
  finalize,
  from,
  fromEvent,
  ignoreElements,
  map,
  merge,
  mergeMap,
  of,
  Subject,
  take,
  tap,
  zip,
} from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CanvasStack } from "./components/canvas-stack";
import { CardQueue } from "./components/card-queue";
import { CharacterCanvas } from "./components/character-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { startIdeaGeneration } from "./components/idea-generator";
import { identifyCharacter, identifyCharacterFast } from "./components/identify-character";
import { designSound } from "./components/sound-design";
import { generateSoundEffect, Soundscape } from "./components/soundscape";

interface Point {
  x: number;
  y: number;
}

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas", "OverlayCanvas");
  new CharacterCanvas("debug");
  const soundscape = new Soundscape();
  new CanvasStack("canvas-stack");
  const canvasStack = document.getElementById("canvas-stack")!;
  const overlayCanvas = document.getElementById("OverlayCanvas") as HTMLCanvasElement;
  const overlayCtx = overlayCanvas.getContext("2d")!;
  const ideaHints = new CardQueue("right", 7);
  const history = new CardQueue("left", 7);
  let isCalibrating = false;
  let currentCalibrationStep = -1;

  const setCanvasAnchoring = (enabled: boolean) => {
    ideaHints.setMappingMode(enabled, canvasStack);
    history.setMappingMode(enabled, canvasStack);
  };

  const clearCalibrationOverlay = () => {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  };

  const drawCalibrationTarget = (point: Point) => {
    clearCalibrationOverlay();
    overlayCtx.save();
    overlayCtx.fillStyle = "#ff3b30";
    overlayCtx.strokeStyle = "#ffffff";
    overlayCtx.lineWidth = 4;
    overlayCtx.beginPath();
    overlayCtx.arc(point.x, point.y, 18, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.stroke();
    overlayCtx.restore();
  };

  const captureCalibrationTouch = () =>
    new Promise<Point>((resolve) => {
      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        window.removeEventListener("pointerdown", handlePointerDown, true);
        resolve({
          x: event.clientX / Math.max(window.innerWidth, 1),
          y: event.clientY / Math.max(window.innerHeight, 1),
        });
      };

      window.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: false });
    });

  const musicToggle = document.getElementById("music-toggle") as HTMLButtonElement;
  musicToggle.addEventListener("click", () => {
    const nextIndex = soundscape.currentTrackIndex + 1;
    if (nextIndex >= soundscape.totalTracks) {
      soundscape.stopBackground();
    } else {
      soundscape.startBackground(nextIndex).catch((err) => console.error("Failed to start music:", err));
    }
    musicToggle.textContent = soundscape.currentTrackIndex === -1 ? "Music: Off" : `Music: ${soundscape.currentTrackIndex + 1}`;
  });

  const sfxToggle = document.getElementById("sfx-toggle") as HTMLButtonElement;
  sfxToggle.addEventListener("click", () => {
    const enabled = soundscape.toggleSfx();
    sfxToggle.textContent = enabled ? "SFX: On" : "SFX: Off";
  });

  const layoutToggle = document.getElementById("layout-toggle") as HTMLButtonElement;
  let isTopBottom = false;
  layoutToggle.addEventListener("click", () => {
    isTopBottom = !isTopBottom;
    if (isTopBottom) {
      ideaHints.setSide("top");
      history.setSide("bottom");
      layoutToggle.textContent = "Layout: Top-Bottom";
    } else {
      ideaHints.setSide("right");
      history.setSide("left");
      layoutToggle.textContent = "Layout: Left-Right";
    }
  });

  const calibrateToggle = document.getElementById("calibrate-toggle") as HTMLButtonElement;

  const updateCalibrationUi = () => {
    canvasStack.classList.toggle("calibrating", isCalibrating);
    calibrateToggle.disabled = isCalibrating;
    calibrateToggle.textContent =
      isCalibrating && currentCalibrationStep >= 0
        ? `Calibrating ${currentCalibrationStep + 1}/4`
        : drawCanvas.hasInputCalibration
        ? "Calibrate Again"
        : "Calibrate";
    setCanvasAnchoring(isCalibrating || drawCanvas.hasInputCalibration);
    if (!isCalibrating) {
      clearCalibrationOverlay();
    }
  };

  const runCalibration = async () => {
    if (isCalibrating) {
      return;
    }

    const targetPoints = drawCanvas.getCalibrationTargets();
    const sourcePoints: Point[] = [];

    isCalibrating = true;
    drawCanvas.setInputLocked(true);

    try {
      for (const [index, targetPoint] of targetPoints.entries()) {
        currentCalibrationStep = index;
        updateCalibrationUi();
        drawCalibrationTarget(targetPoint);
        sourcePoints.push(await captureCalibrationTouch());
      }

      if (!drawCanvas.applyInputCalibration(sourcePoints, targetPoints)) {
        console.error("Calibration failed: unable to compute a stable input transform.");
      }
    } catch (error) {
      console.error("Calibration failed:", error);
    } finally {
      isCalibrating = false;
      currentCalibrationStep = -1;
      drawCanvas.setInputLocked(false);
      updateCalibrationUi();
    }
  };

  calibrateToggle.addEventListener("click", () => {
    void runCalibration();
  });
  updateCalibrationUi();

  const flipToggle = document.getElementById("flip-toggle") as HTMLButtonElement;
  flipToggle.addEventListener("click", () => {
    const isFlipped = document.body.classList.toggle("flip-x");
    flipToggle.textContent = isFlipped ? "Flip: On" : "Flip: Off";
  });

  const recognizedConcepts$ = new Subject<{ character: string; meaning: string }>();

  const ideasHinting$ = startIdeaGeneration(recognizedConcepts$).pipe(tap((idea) => ideaHints.add(idea)));
  ideasHinting$.subscribe();

  const program$ = fromEvent(drawCanvas, "drawingstop")
    .pipe(
      mergeMap(() => {
        const stack = document.querySelector(".canvas-stack")!;

        const dataUrl = drawCanvas.readBase64DataUrl();
        const boundingBox = drawCanvas.getBoundingBox();
        if (!boundingBox) {
          return EMPTY;
        }

        const charCanvasElement = CharacterCanvas.createElement(`CharacterCanvas-${Date.now()}`);
        const next = drawCanvas.element.nextSibling;
        if (next) stack.insertBefore(charCanvasElement, next);
        else stack.appendChild(charCanvasElement);
        const charCanvas = new CharacterCanvas(charCanvasElement.id);
        charCanvas.writeDataUrl(drawCanvas.readBase64DataUrl(true)).then(() => {
          drawCanvas.clear();
          charCanvas.startDrying(boundingBox);
        });
        const fast$ = from(identifyCharacterFast(connection, dataUrl)).pipe(
          tap((result) => console.log("Fast OCR", result)),
          map((meaning) => ({ identifiedMeaning: meaning, box: boundingBox, charCanvas }))
        );
        const slow$ = from(identifyCharacter(connection, dataUrl)).pipe(
          tap((result) => {
            console.log("Slow OCR", `${result.character} ${result.meaning}`);
            recognizedConcepts$.next(result);
            history.add(result);
          }),
          ignoreElements()
        );
        return merge(fast$, slow$);
      }),
      concatMap((result) => {
        const isEmpty = generativeCanvas.isCanvasEmpty();
        const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
        console.log("Overlay Image:", { overlayImage, result });

        const visual$ = from(
          overlayImage ? editPainting(connection, overlayImage, result.identifiedMeaning) : generatePainting(connection, result.identifiedMeaning)
        ).pipe(
          concatMap((imageUrls) => from(imageUrls)),
          take(1),
          concatMap(async (imageUrl) => {
            await generativeCanvas.writeDataUrl(imageUrl);
          }),
          catchError((err) => {
            console.error("Visual generation error:", err);
            return of(null);
          }),
          finalize(() => {
            generativeCanvas.clearOverlay();
          })
        );

        const sound$ = soundscape.sfxEnabled
          ? designSound({ connection, concept: result.identifiedMeaning }).pipe(
              mergeMap((description) => {
                console.log("Sound design description:", description);
                return generateSoundEffect(connection, description, soundscape.audioContext);
              }),
              catchError((err) => {
                console.warn("Sound generation failed, proceeding with visual only:", err);
                return of(null);
              }),
              defaultIfEmpty(null)
            )
          : of(null);

        return zip(visual$, sound$).pipe(
          mergeMap(([_, buffer]) => (buffer ? soundscape.play(buffer, { loopCount: 0, stopOthers: true }) : of(undefined))),
          catchError((err) => {
            console.error("Audio playback error:", err);
            return EMPTY;
          })
        );
      })
    )
    .pipe(
      finalize(() => {
        soundscape.stopAll();
      })
    );

  program$.subscribe();
}

main();
