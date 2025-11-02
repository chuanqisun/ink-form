import { concatMap, EMPTY, from, fromEvent, mergeMap, take } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { identifyCharacter } from "./components/identify-character";
import { convertToBase64url } from "./components/image-data";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas");

  const program$ = fromEvent(drawCanvas, "drawingstop").pipe(
    mergeMap(() => {
      const dataUrl = convertToBase64url(drawCanvas.element);
      const boundingBox = drawCanvas.getBoundingBox();
      drawCanvas.clear();
      if (!boundingBox) return EMPTY;

      return identifyCharacter(connection, dataUrl).then((char) => ({
        character: char,
        box: boundingBox,
      }));
    }),
    concatMap((result) => {
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
