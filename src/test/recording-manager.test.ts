import { describe, it, expect, beforeEach, vi } from "vitest";
import { RecordingManager } from "../components/recording-manager";

describe("RecordingManager", () => {
  let recordingManager: RecordingManager;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    recordingManager = new RecordingManager();
    
    // Create a mock canvas
    canvas = document.createElement("canvas");
    canvas.id = "testCanvas";
    canvas.width = 720;
    canvas.height = 1280;
    document.body.appendChild(canvas);
  });

  it("should not be recording initially", () => {
    expect(recordingManager.getIsRecording()).toBe(false);
  });

  it("should start recording successfully", async () => {
    await recordingManager.startRecording("testCanvas");
    expect(recordingManager.getIsRecording()).toBe(true);
  });

  it("should throw error if canvas not found", async () => {
    await expect(recordingManager.startRecording("nonexistentCanvas")).rejects.toThrow(
      "Canvas with id nonexistentCanvas not found"
    );
  });

  it("should throw error if already recording", async () => {
    await recordingManager.startRecording("testCanvas");
    await expect(recordingManager.startRecording("testCanvas")).rejects.toThrow(
      "Already recording"
    );
  });

  it("should stop recording", async () => {
    await recordingManager.startRecording("testCanvas");
    recordingManager.stopRecording();
    expect(recordingManager.getIsRecording()).toBe(false);
  });

  it("should emit recordingstart event when recording starts", async () => {
    const listener = vi.fn();
    recordingManager.addEventListener("recordingstart", listener);
    
    await recordingManager.startRecording("testCanvas");
    
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should emit recordingstop event when recording stops", async () => {
    const listener = vi.fn();
    recordingManager.addEventListener("recordingstop", listener);
    
    await recordingManager.startRecording("testCanvas");
    recordingManager.stopRecording();
    
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should create audio destination for recording with audio", async () => {
    const mockAudioContext = new AudioContext();
    await recordingManager.startRecording("testCanvas", mockAudioContext);
    
    const audioDestination = recordingManager.getAudioDestination();
    expect(audioDestination).toBeTruthy();
  });

  it("should not fail when stopping without starting", () => {
    expect(() => recordingManager.stopRecording()).not.toThrow();
  });
});
