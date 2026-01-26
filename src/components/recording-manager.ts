/**
 * Manages video recording of canvas with audio
 * Uses MediaRecorder API and File System Access API
 */
export class RecordingManager extends EventTarget {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private canvasElement: HTMLCanvasElement | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    super();
  }

  /**
   * Start recording the canvas with audio
   */
  async startRecording(canvasId: string, audioContext?: AudioContext): Promise<void> {
    if (this.isRecording) {
      throw new Error("Already recording");
    }

    this.canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!this.canvasElement) {
      throw new Error(`Canvas with id ${canvasId} not found`);
    }

    // Capture canvas stream
    const canvasStream = this.canvasElement.captureStream(30); // 30 FPS

    let combinedStream: MediaStream;

    // Add audio if available
    if (audioContext) {
      // Create audio destination to capture audio
      this.audioDestination = audioContext.createMediaStreamDestination();
      
      // Get all audio nodes and connect them to the destination
      // Note: This requires the audio system to expose its audio nodes
      const audioStream = this.audioDestination.stream;
      
      // Combine video and audio streams
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioTrack = audioStream.getAudioTracks()[0];
      
      combinedStream = new MediaStream([videoTrack, audioTrack]);
    } else {
      combinedStream = canvasStream;
    }

    // Create MediaRecorder
    const options: MediaRecorderOptions = {
      mimeType: this.getSupportedMimeType(),
      videoBitsPerSecond: 2500000, // 2.5 Mbps
    };

    this.mediaRecorder = new MediaRecorder(combinedStream, options);
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      await this.saveRecording();
    };

    this.mediaRecorder.onerror = (event: Event) => {
      console.error("MediaRecorder error:", event);
      this.dispatchEvent(new CustomEvent("recordingerror", { detail: { error: event } }));
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
    this.isRecording = true;
    this.dispatchEvent(new CustomEvent("recordingstart"));
  }

  /**
   * Stop recording and save the file
   */
  stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      return;
    }

    this.mediaRecorder.stop();
    this.isRecording = false;
    
    // Stop all tracks
    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    this.dispatchEvent(new CustomEvent("recordingstop"));
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get the audio destination node for connecting audio sources
   */
  getAudioDestination(): MediaStreamAudioDestinationNode | null {
    return this.audioDestination;
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "video/webm"; // Fallback
  }

  /**
   * Save recording using File System Access API
   */
  private async saveRecording(): Promise<void> {
    if (this.recordedChunks.length === 0) {
      console.warn("No recorded data to save");
      return;
    }

    const mimeType = this.getSupportedMimeType();
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const suggestedName = `recording-${timestamp}.${extension}`;

    try {
      // Use File System Access API if available
      if ("showSaveFilePicker" in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Video Files",
              accept: {
                "video/webm": [".webm"],
                "video/mp4": [".mp4"],
              },
            },
          ],
        });

        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        this.dispatchEvent(new CustomEvent("recordingsaved", { detail: { filename: suggestedName } }));
      } else {
        // Fallback to download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.dispatchEvent(new CustomEvent("recordingsaved", { detail: { filename: suggestedName } }));
      }
    } catch (error) {
      console.error("Error saving recording:", error);
      this.dispatchEvent(new CustomEvent("recordingerror", { detail: { error } }));
    }

    // Clear recorded chunks
    this.recordedChunks = [];
  }
}
