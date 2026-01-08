import { catchError, concatMap, defaultIfEmpty, EMPTY, finalize, from, fromEvent, map, mergeMap, of, Subject, take, tap, zip } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CanvasStack } from "./components/canvas-stack";
import { CharacterCanvas } from "./components/character-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { startIdeaGeneration } from "./components/idea-generator";
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

  const recognizedConcepts$ = new Subject<string>();

  startIdeaGeneration(recognizedConcepts$).subscribe((idea) => {
    console.log("New Idea:", idea);
  });

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
      tap((result) => recognizedConcepts$.next(result.character)),
      concatMap((result) => {
        console.log("Character", result.character);

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

        const sound$ = designSound({ connection, concept: result.character }).pipe(
          mergeMap((description) => {
            console.log("Sound design description:", description);
            return generateSoundEffect(connection, description, soundscape.audioContext);
          }),
          catchError((err) => {
            console.warn("Sound generation failed, proceeding with visual only:", err);
            return of(null);
          }),
          defaultIfEmpty(null)
        );

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
