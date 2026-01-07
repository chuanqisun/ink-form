export class CanvasStack {
  constructor(elementId: string) {
    const canvasStack = document.getElementById(elementId)!;
    canvasStack.addEventListener("command", (event: any) => {
      if (event.command === "--toggle-debug") {
        canvasStack.classList.toggle("debug");
      }
    });
  }
}
