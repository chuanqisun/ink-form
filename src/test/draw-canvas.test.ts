import { describe, it, expect, beforeEach, vi } from "vitest";
import { DrawingCanvas } from "../components/draw-canvas";

describe("DrawingCanvas", () => {
  let drawingCanvas: DrawingCanvas;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    // Create a mock canvas
    canvas = document.createElement("canvas");
    canvas.id = "drawCanvas";
    canvas.width = 720;
    canvas.height = 1280;
    document.body.appendChild(canvas);

    drawingCanvas = new DrawingCanvas("drawCanvas");
  });

  it("should initialize correctly", () => {
    expect(drawingCanvas.element).toBe(canvas);
  });

  it("should read base64 data URL", () => {
    const dataUrl = drawingCanvas.readBase64DataUrl();
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("should clear the canvas", () => {
    drawingCanvas.clear();
    const dataUrl = drawingCanvas.readBase64DataUrl();
    // After clearing, the canvas should still return a data URL
    expect(dataUrl).toBeTruthy();
  });

  it("should return null bounding box for empty canvas", () => {
    const boundingBox = drawingCanvas.getBoundingBox();
    expect(boundingBox).toBeNull();
  });
});
