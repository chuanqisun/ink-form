import { concatMap, EMPTY, from, fromEvent, map, mergeMap, take } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CanvasStack } from "./components/canvas-stack";
import { CharacterCanvas } from "./components/character-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { identifyCharacter } from "./components/identify-character";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas");
  const debugCanvas = new CharacterCanvas("debug");
  new CanvasStack("canvas-stack");

  const program$ = fromEvent(drawCanvas, "drawingstop").pipe(
    mergeMap(() => {
      const stack = document.querySelector(".canvas-stack")!;

      const dataUrl = drawCanvas.readBase64DataUrl();
      const boundingBox = drawCanvas.getBoundingBox();
      if (!boundingBox) {
        return EMPTY;
      }

      const charCanvasElement = CharacterCanvas.createElement(`CharacterCanvas-${Date.now()}`);
      stack.insertBefore(charCanvasElement, drawCanvas.element);
      const charCanvas = new CharacterCanvas(charCanvasElement.id);
      charCanvas.writeDataUrl(drawCanvas.readBase64DataUrl(true)).then(() => drawCanvas.clear());
      return from(identifyCharacter(connection, dataUrl)).pipe(map((char) => ({ character: char, box: boundingBox, charCanvas })));
    }),
    concatMap((result) => {
      console.log("Character", result.character);
      const isEmpty = generativeCanvas.isCanvasEmpty();
      const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
      console.log("Overlay Image:", { overlayImage, result });
      if (overlayImage) debugCanvas.writeDataUrl(overlayImage);
      return from(overlayImage ? editPainting(connection, overlayImage, result.character) : generatePainting(connection, result.character)).pipe(
        concatMap((imageUrls) => from(imageUrls)),
        take(1),
        concatMap(async (imageUrl) => {
          await generativeCanvas.writeDataUrl(imageUrl);
          result.charCanvas.destroy();
        })
      );
    })
  );

  program$.subscribe();
}

main();
