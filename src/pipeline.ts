import { concatMap, EMPTY, from, fromEvent, map, mergeMap, take } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { identifyCharacter } from "./components/identify-character";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas");

  const program$ = fromEvent(drawCanvas, "drawingstop").pipe(
    mergeMap(() => {
      const charCanvas = document.createElement("canvas");
      charCanvas.width = 360;
      charCanvas.height = 640;
      charCanvas.style.position = "absolute";
      charCanvas.style.top = "0";
      charCanvas.style.left = "0";
      charCanvas.style.border = "1px solid black";
      const stack = document.querySelector(".canvas-stack")!;
      stack.insertBefore(charCanvas, drawCanvas.element);
      const ctx = charCanvas.getContext("2d")!;
      ctx.putImageData(drawCanvas.readImage(), 0, 0);
      const dataUrl = drawCanvas.readBase64DataUrl();
      const boundingBox = drawCanvas.getBoundingBox();
      drawCanvas.clear();
      if (!boundingBox) {
        charCanvas.remove();
        return EMPTY;
      }
      return from(identifyCharacter(connection, dataUrl)).pipe(map((char) => ({ character: char, box: boundingBox, charCanvas })));
    }),
    concatMap((result) => {
      console.log("Character", result.character);
      const isEmpty = generativeCanvas.isCanvasEmpty();
      const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
      console.log("Overlay Image:", overlayImage);
      return from(overlayImage ? editPainting(connection, overlayImage, result.character) : generatePainting(connection, result.character)).pipe(
        concatMap((imageUrls) => from(imageUrls)),
        take(1),
        concatMap(async (imageUrl) => {
          await generativeCanvas.writeDataUrl(imageUrl);
          result.charCanvas.remove();
        })
      );
    })
  );

  program$.subscribe();
}

main();
