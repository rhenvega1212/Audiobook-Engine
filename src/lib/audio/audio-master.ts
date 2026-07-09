import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Browser-only audio mastering utilities for producing upload-ready audiobook
 * files. Every clip returned by ElevenLabs is decoded to mono 44.1kHz PCM,
 * concatenated with pacing gaps and room tone, loudness-normalized to platform
 * targets, and encoded to a 192 kbps CBR MP3 (ACX / Findaway / Spotify spec).
 *
 * These functions rely on the Web Audio API and must run in the browser.
 */

export const AUDIOBOOK_SAMPLE_RATE = 44100;
export const AUDIOBOOK_MP3_KBPS = 192;

// ACX / Findaway targets.
const TARGET_RMS_DB = -20; // within the required -23..-18 dB window
const PEAK_CEILING_DB = -3; // required maximum peak

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

let sharedDecodeContext: AudioContext | null = null;

function getDecodeContext(): AudioContext {
  if (!sharedDecodeContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    sharedDecodeContext = new Ctor();
  }
  return sharedDecodeContext;
}

/**
 * Decode an encoded audio clip (MP3 from ElevenLabs) into a mono Float32 PCM
 * buffer resampled to 44.1kHz. Uses an OfflineAudioContext so decoding,
 * downmix-to-mono, and resampling all happen in one pass.
 */
export async function decodeToMonoPcm(
  encoded: ArrayBuffer
): Promise<Float32Array> {
  const decodeCtx = getDecodeContext();
  // slice(0) guards against the buffer being detached/neutered elsewhere.
  const decoded = await decodeCtx.decodeAudioData(encoded.slice(0));

  const frameCount = Math.ceil(
    decoded.duration * AUDIOBOOK_SAMPLE_RATE
  );
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, frameCount),
    AUDIOBOOK_SAMPLE_RATE
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** A buffer of digital silence, used for room tone and inter-clip pacing. */
export function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * AUDIOBOOK_SAMPLE_RATE));
}

/** Concatenate PCM segments into a single buffer. */
export function concatPcm(segments: Float32Array[]): Float32Array {
  let total = 0;
  for (const seg of segments) total += seg.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const seg of segments) {
    out.set(seg, offset);
    offset += seg.length;
  }
  return out;
}

/**
 * Normalize a PCM buffer in place to the ACX loudness window: raise/lower to a
 * ~-20 dB RMS target, then pull the gain back if that would push peaks above
 * the -3 dB ceiling. Returns the applied linear gain (for diagnostics).
 */
export function normalizeLoudness(pcm: Float32Array): number {
  if (pcm.length === 0) return 1;

  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i]!;
    sumSquares += sample * sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }

  const rms = Math.sqrt(sumSquares / pcm.length);
  if (rms === 0) return 1;

  let gain = dbToLinear(TARGET_RMS_DB) / rms;

  const peakCeiling = dbToLinear(PEAK_CEILING_DB);
  if (peak * gain > peakCeiling) {
    gain = peakCeiling / peak;
  }

  for (let i = 0; i < pcm.length; i++) {
    let v = pcm[i]! * gain;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    pcm[i] = v;
  }

  return gain;
}

function floatToInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Encode a mono Float32 PCM buffer to a 192 kbps CBR 44.1kHz MP3 Blob.
 */
export function encodeMp3(pcm: Float32Array): Blob {
  const encoder = new Mp3Encoder(1, AUDIOBOOK_SAMPLE_RATE, AUDIOBOOK_MP3_KBPS);
  const samples = floatToInt16(pcm);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < samples.length; i += blockSize) {
    const slice = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

/** Duration in seconds of a PCM buffer at the audiobook sample rate. */
export function pcmDurationSeconds(pcm: Float32Array): number {
  return pcm.length / AUDIOBOOK_SAMPLE_RATE;
}
