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

  /**
   * Plays an AudioBuffer. Returns an Observable that completes when the sound finishes.
   * Unsubscribing from the Observable will stop the sound with a fade.
   */
  play(buffer: AudioBuffer, options: PlaybackOptions = {}): Observable<void> {
    return new Observable<void>((subscriber) => {
      const { loopCount = 0, stopOthers = false } = options;
      const fadeTime = 0.5;

      if (stopOthers) {
        this.stopAll(fadeTime);
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
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + fadeTime);

      const voice = { source, gain };
      this.activeVoices.add(voice);

      source.onended = () => {
        if (this.activeVoices.has(voice)) {
          this.activeVoices.delete(voice);
          subscriber.next();
          subscriber.complete();
        }
      };

      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      source.start(now);

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
      this.activeVoices.delete(voice);
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
