import { catchError, concatMap, EMPTY, finalize, from, fromEvent, map, merge, mergeMap, take } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CanvasStack } from "./components/canvas-stack";
import { CharacterCanvas } from "./components/character-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { identifyCharacter } from "./components/identify-character";
import { designSound } from "./components/sound-design";
import { generateSoundEffect, Soundscape } from "./components/soundscape";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas");
  new CharacterCanvas("debug");
  const soundscape = new Soundscape();
  new CanvasStack("canvas-stack");

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
        charCanvas.writeDataUrl(drawCanvas.readBase64DataUrl(true)).then(() => drawCanvas.clear());
        return from(identifyCharacter(connection, dataUrl)).pipe(map((char) => ({ character: char, box: boundingBox, charCanvas })));
      }),
      concatMap((result) => {
        console.log("Character", result.character);

        const audio$ = designSound({ connection, concept: result.character }).pipe(
          mergeMap((description) => {
            console.log("Sound design description:", description);
            return generateSoundEffect(connection, description, soundscape.audioContext);
          }),
          mergeMap((buffer) => soundscape.play(buffer, { loopCount: 0, stopOthers: true })),
          catchError((err) => {
            console.error("Audio playback error:", err);
            return EMPTY;
          })
        );

        const isEmpty = generativeCanvas.isCanvasEmpty();
        const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
        console.log("Overlay Image:", { overlayImage, result });

        const visual$ = from(overlayImage ? editPainting(connection, overlayImage, result.character) : generatePainting(connection, result.character)).pipe(
          concatMap((imageUrls) => from(imageUrls)),
          take(1),
          concatMap(async (imageUrl) => {
            await generativeCanvas.writeDataUrl(imageUrl);
            result.charCanvas.destroy();
          })
        );

        return merge(audio$, visual$);
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
