import { fromEvent, mergeMap, tap } from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { DrawingCanvas } from "./components/draw-canvas";
import { identifyCharacter } from "./components/identify-character";
import { convertToBase64url } from "./components/image-data";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");

  const program$ = fromEvent(drawCanvas, "drawingstop").pipe(
    mergeMap(() => {
      const dataUrl = convertToBase64url(drawCanvas.element);
      drawCanvas.consume();
      return identifyCharacter(connection, dataUrl);
    }),
    tap((result) => {
      console.log("Identified Character:", result);
    })
  );

  program$.subscribe();
}

main();
