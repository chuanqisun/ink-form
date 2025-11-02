export function convertToBase64url(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
