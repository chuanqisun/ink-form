import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { EMPTY, Observable } from "rxjs";
import { AIConnection } from "./ai-connection";

/**
 * Generates an AudioBuffer from text using ElevenLabs Sound Effects API.
 * The operation is cancellable via RxJS subscription.
 */
export function generateSoundEffect(connection: AIConnection, text: string, audioContext: AudioContext): Observable<AudioBuffer> {
  const apiKey = connection.getElevenLabsApiKey();
  if (!apiKey) {
    return EMPTY;
  }

  return new Observable<AudioBuffer>((subscriber) => {
    let aborted = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const run = async () => {
      try {
        const elevenlabs = new ElevenLabsClient({ apiKey });
        const stream = await elevenlabs.textToSoundEffects.convert({
          text,
          durationSeconds: 4,
          promptInfluence: 0.8,
          outputFormat: "mp3_44100_128",
        });

        if (aborted) {
          if (stream && "getReader" in stream) {
            const r = stream.getReader();
            r.cancel();
          }
          return;
        }

        reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        if (aborted) return;

        const arrayBuffer = await new Blob(chunks as BlobPart[]).arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        subscriber.next(audioBuffer);
        subscriber.complete();
      } catch (err) {
        if (!aborted) {
          subscriber.error(err);
        }
      }
    };

    run();

    return () => {
      aborted = true;
      if (reader) {
        reader.cancel();
      }
    };
  });
}

/**
 * Repeats an AudioBuffer N times by concatenating it.
 */
function repeatBuffer(context: AudioContext, buffer: AudioBuffer, count: number): AudioBuffer {
  if (count <= 1) return buffer;
  const newBuffer = context.createBuffer(buffer.numberOfChannels, buffer.length * count, buffer.sampleRate);
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const data = buffer.getChannelData(i);
    const newData = newBuffer.getChannelData(i);
    for (let j = 0; j < count; j++) {
      newData.set(data, j * buffer.length);
    }
  }
  return newBuffer;
}

export interface PlaybackOptions {
  /** Number of times to loop. 0 = play once, -1 = infinite. */
  loopCount?: number;
  /** If true, stops all other active sounds with a cross-fade. */
  stopOthers?: boolean;
}

/**
 * Manages audio playback with support for concurrency, looping, and cross-fading.
 */
export class Soundscape {
  public readonly audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  private activeVoices = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
  private backgroundVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly BACKGROUND_VOLUME = 0.75;
  private readonly BACKGROUND_LOW_VOLUME = 0.1;

  private _currentTrackIndex: number = -1;
  private readonly _totalTracks = 3;

  get currentTrackIndex() {
    return this._currentTrackIndex;
  }

  get totalTracks() {
    return this._totalTracks;
  }

  async startBackground(index: number = 0) {
    this.stopBackground();
    this._currentTrackIndex = index % this._totalTracks;

    const modules = [await import("../assets/track-01.mp3"), await import("../assets/track-02.mp3"), await import("../assets/track-03.mp3")];
    const availableTracks = modules.map((m) => m.default);
    const trackUrl = availableTracks[this._currentTrackIndex];

    const response = await fetch(trackUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;

    const gain = this.audioContext.createGain();
    // Start at low volume if sounds are already playing, else normal volume
    gain.gain.value = this.activeVoices.size > 0 ? this.BACKGROUND_LOW_VOLUME : this.BACKGROUND_VOLUME;
    source.connect(gain);
    gain.connect(this.audioContext.destination);

    source.start();
    this.backgroundVoice = { source, gain };
  }

  stopBackground() {
    this._currentTrackIndex = -1;
    if (this.backgroundVoice) {
      try {
        this.backgroundVoice.source.stop();
        this.backgroundVoice.source.disconnect();
        this.backgroundVoice.gain.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.backgroundVoice = null;
    }
  }

  private fadeBackground(targetVolume: number, duration: number) {
    if (!this.backgroundVoice) return;
    const now = this.audioContext.currentTime;
    this.backgroundVoice.gain.gain.cancelScheduledValues(now);
    this.backgroundVoice.gain.gain.setValueAtTime(this.backgroundVoice.gain.gain.value, now);
    this.backgroundVoice.gain.gain.linearRampToValueAtTime(targetVolume, now + duration);
  }

  /**
   * Plays an AudioBuffer. Returns an Observable that completes when the sound finishes.
   * Unsubscribing from the Observable will stop the sound with a fade.
   */
  play(buffer: AudioBuffer, options: PlaybackOptions = {}): Observable<void> {
    return new Observable<void>((subscriber) => {
      const { loopCount = 0, stopOthers = false } = options;
      const fadeTime = 0.5;
      const startDelay = 0;

      if (stopOthers) {
        this.stopAll(fadeTime);
      }

      if (this.activeVoices.size === 0) {
        this.fadeBackground(this.BACKGROUND_LOW_VOLUME, 0.5);
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = loopCount > 0 ? repeatBuffer(this.audioContext, buffer, loopCount + 1) : buffer;

      if (loopCount === -1) {
        source.loop = true;
      }

      const gain = this.audioContext.createGain();
      source.connect(gain);
      gain.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      const startTime = now + startDelay;

      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + 0.5);

      if (loopCount !== -1 && source.buffer) {
        const duration = source.buffer.duration;
        const fadeOutStart = Math.max(0.5, duration - fadeTime);
        gain.gain.setValueAtTime(1, startTime + fadeOutStart);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);
      }

      const voice = { source, gain };
      this.activeVoices.add(voice);

      source.onended = () => {
        if (this.activeVoices.has(voice)) {
          this.activeVoices.delete(voice);
          if (this.activeVoices.size === 0) {
            this.fadeBackground(this.BACKGROUND_VOLUME, 0.5);
          }
          subscriber.next();
          subscriber.complete();
        }
      };

      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      source.start(startTime);

      return () => {
        this.stopVoice(voice, fadeTime);
      };
    });
  }

  private stopVoice(voice: { source: AudioBufferSourceNode; gain: GainNode }, fadeTime: number) {
    if (!this.activeVoices.has(voice)) return;

    const now = this.audioContext.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
      voice.source.stop(now + fadeTime);
    } catch (e) {
      // Source might already be stopped
    }

    // Delay removal to allow fade out to complete
    setTimeout(() => {
      if (this.activeVoices.has(voice)) {
        this.activeVoices.delete(voice);
        if (this.activeVoices.size === 0) {
          this.fadeBackground(this.BACKGROUND_VOLUME, 0.5);
        }
      }
    }, fadeTime * 1000 + 100);
  }

  /**
   * Stops all active voices with a cross-fade.
   */
  stopAll(fadeTime: number = 0.5) {
    for (const voice of Array.from(this.activeVoices)) {
      this.stopVoice(voice, fadeTime);
    }
  }
}
