import { concatMap, EMPTY, from, fromEvent, mergeMap, take } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CharacterCanvas } from "./components/base-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { identifyCharacter } from "./components/identify-character";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas");
  const characterCanvas = new CharacterCanvas("CharacterCanvas");

  const program$ = fromEvent(drawCanvas, "drawingstop").pipe(
    mergeMap(() => {
      characterCanvas.writeImage(drawCanvas.readImage());
      const dataUrl = drawCanvas.readBase64DataUrl();
      const boundingBox = drawCanvas.getBoundingBox();
      drawCanvas.clear();
      if (!boundingBox) return EMPTY;

      return identifyCharacter(connection, dataUrl).then((char) => ({
        character: char,
        box: boundingBox,
      }));
    }),
    concatMap((result) => {
      console.log("Character", result.character);
      const isEmpty = generativeCanvas.isCanvasEmpty();
      const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
      console.log("Overlay Image:", overlayImage);
      return from(overlayImage ? editPainting(connection, overlayImage, result.character) : generatePainting(connection, result.character)).pipe(
        concatMap((imageUrls) => from(imageUrls)),
        take(1),
        concatMap(async (imageUrl) => generativeCanvas.writeDataUrl(imageUrl))
      );
    })
  );

  program$.subscribe();
}

main();
