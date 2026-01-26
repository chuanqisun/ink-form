// Test setup file
import { beforeAll, afterEach, vi } from "vitest";

// Mock Web Audio API
beforeAll(() => {
  // Mock AudioContext as a proper class
  (global as any).AudioContext = class MockAudioContext {
    createBufferSource = vi.fn().mockReturnValue({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
      loop: false,
    });
    createGain = vi.fn().mockReturnValue({
      connect: vi.fn(),
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    });
    createMediaStreamDestination = vi.fn().mockReturnValue({
      stream: {
        getAudioTracks: vi.fn().mockReturnValue([{ kind: "audio" }]),
      },
    });
    decodeAudioData = vi.fn().mockResolvedValue({
      duration: 1,
      length: 44100,
      sampleRate: 44100,
    });
    destination = {};
    currentTime = 0;
    state = "running";
    resume = vi.fn().mockResolvedValue(undefined);
  };

  // Mock MediaRecorder as a proper class
  (global as any).MediaRecorder = class MockMediaRecorder {
    ondataavailable: ((event: any) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    state = "inactive";
    stream: any;
    
    constructor(stream: any, _options?: any) {
      this.stream = {
        ...stream,
        getTracks: vi.fn().mockReturnValue([
          { kind: "video", stop: vi.fn() }
        ]),
      };
    }
    
    start = vi.fn();
    stop = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    
    static isTypeSupported = vi.fn().mockReturnValue(true);
  };

  // Mock HTMLCanvasElement.getContext
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: any) {
    if (contextId === "2d") {
      return {
        canvas: this,
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        putImageData: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(this.width * this.height * 4),
          width: this.width,
          height: this.height,
        }),
        drawImage: vi.fn(),
      } as any;
    }
    return originalGetContext.call(this, contextId, options);
  };

  // Mock HTMLCanvasElement.captureStream
  HTMLCanvasElement.prototype.captureStream = vi.fn().mockReturnValue({
    getVideoTracks: vi.fn().mockReturnValue([{ kind: "video" }]),
    getTracks: vi.fn().mockReturnValue([{ kind: "video" }]),
  }) as any;
  
  // Mock HTMLCanvasElement.toDataURL
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

  // Mock File System Access API
  (global as any).showSaveFilePicker = vi.fn().mockResolvedValue({
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
