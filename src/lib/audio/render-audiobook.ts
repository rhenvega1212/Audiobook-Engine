import type { VoiceSettings } from "@/lib/elevenlabs/voice-settings";
import {
  concatPcm,
  decodeToMonoPcm,
  encodeMp3,
  normalizeLoudness,
  pcmDurationSeconds,
  silence,
} from "@/lib/audio/audio-master";

/**
 * Client-side audiobook renderer. Turns tagged lines + chapters into
 * upload-ready, per-chapter MP3 files (plus opening/closing credits), all in
 * the browser: ElevenLabs renders each clip, the Web Audio API assembles and
 * masters each chapter, and the result is a set of MP3 Blobs ready to zip.
 */

export type RenderLine = {
  id: string;
  line_order: number;
  speaker_label: string;
  spoken_text: string;
  voice_id: string | null;
  language_code?: string | null;
  voice_settings?: VoiceSettings | null;
};

export type RenderChapter = {
  title: string;
  start_line_order: number;
};

export type RenderedFile = {
  filename: string;
  title: string;
  blob: Blob;
  durationSec: number;
};

export type RenderProgress = {
  phase: "rendering" | "packaging" | "done";
  clipsDone: number;
  clipsTotal: number;
  filesDone: number;
  filesTotal: number;
  currentTitle: string;
  message: string;
};

export type RenderOptions = {
  lines: RenderLine[];
  chapters: RenderChapter[];
  narratorVoiceId: string | null;
  narratorLanguageCode?: string | null;
  narratorVoiceSettings?: VoiceSettings | null;
  openingCreditsText: string;
  closingCreditsText: string;
  concurrency?: number;
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
};

const MAX_CLIP_CHARS = 2400;
const ROOM_TONE_START_SEC = 0.6;
const ROOM_TONE_END_SEC = 1.5;
const BLOCK_GAP_SEC = 0.35;

type ClipRequest = {
  voice_id: string;
  text: string;
  language_code?: string | null;
  voice_settings?: VoiceSettings | null;
};

// A chapter (or credits section) planned as an ordered list of speaker blocks,
// where each block is one or more clip requests (long blocks are split to stay
// under the TTS length limit).
type SectionPlan = {
  title: string;
  blocks: ClipRequest[][];
};

function abortError(): DOMException {
  return new DOMException("Audiobook render cancelled", "AbortError");
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "section"
  );
}

/** Split a speaker block's lines into clip requests under the TTS char limit. */
function blockToClipRequests(
  blockLines: RenderLine[],
  voiceId: string
): ClipRequest[] {
  const requests: ClipRequest[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (current.length === 0) return;
    requests.push({
      voice_id: voiceId,
      text: current.join("\n"),
      language_code: blockLines[0]?.language_code ?? null,
      voice_settings: blockLines[0]?.voice_settings ?? null,
    });
    current = [];
    length = 0;
  };

  for (const line of blockLines) {
    const text = line.spoken_text.trim();
    if (!text) continue;
    const addition = text.length + 1;
    if (current.length > 0 && length + addition > MAX_CLIP_CHARS) flush();
    current.push(text);
    length += addition;
  }
  flush();
  return requests;
}

/** Split a single narrator credit string into clip requests under the limit. */
function textToClipRequests(
  text: string,
  voiceId: string,
  languageCode?: string | null,
  voiceSettings?: VoiceSettings | null
): ClipRequest[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const requests: ClipRequest[] = [];
  let current: string[] = [];
  let length = 0;
  for (const word of words) {
    const addition = word.length + 1;
    if (current.length > 0 && length + addition > MAX_CLIP_CHARS) {
      requests.push({ voice_id: voiceId, text: current.join(" "), language_code: languageCode, voice_settings: voiceSettings });
      current = [];
      length = 0;
    }
    current.push(word);
    length += addition;
  }
  if (current.length > 0) {
    requests.push({ voice_id: voiceId, text: current.join(" "), language_code: languageCode, voice_settings: voiceSettings });
  }
  return requests;
}

/** Group a chapter's lines into consecutive same-speaker blocks of clips. */
function chapterToBlocks(chapterLines: RenderLine[]): ClipRequest[][] {
  const blocks: ClipRequest[][] = [];
  let i = 0;
  while (i < chapterLines.length) {
    const speaker = chapterLines[i]!.speaker_label;
    const voiceId = chapterLines[i]!.voice_id;
    let j = i + 1;
    while (
      j < chapterLines.length &&
      chapterLines[j]!.speaker_label === speaker
    ) {
      j++;
    }
    const group = chapterLines.slice(i, j);
    i = j;
    if (!voiceId) continue; // uncast speaker — skip (surfaced as a warning pre-render)
    const requests = blockToClipRequests(group, voiceId);
    if (requests.length > 0) blocks.push(requests);
  }
  return blocks;
}

/** Flatten a section's blocks into an ordered clip list, tracking block spans. */
function flattenBlocks(blocks: ClipRequest[][]): {
  flatRequests: ClipRequest[];
  blockRanges: Array<[number, number]>;
} {
  const flatRequests: ClipRequest[] = [];
  const blockRanges: Array<[number, number]> = [];
  for (const block of blocks) {
    const start = flatRequests.length;
    flatRequests.push(...block);
    blockRanges.push([start, flatRequests.length]);
  }
  return { flatRequests, blockRanges };
}

/** Assemble decoded clip PCM into one mastered-ready buffer with pacing/room tone. */
function assembleSectionPcm(
  clipPcms: Float32Array[],
  blockRanges: Array<[number, number]>
): Float32Array {
  const segments: Float32Array[] = [silence(ROOM_TONE_START_SEC)];
  for (let b = 0; b < blockRanges.length; b++) {
    const [start, end] = blockRanges[b]!;
    for (let k = start; k < end; k++) {
      const pcm = clipPcms[k];
      if (pcm && pcm.length > 0) segments.push(pcm);
    }
    if (b < blockRanges.length - 1) segments.push(silence(BLOCK_GAP_SEC));
  }
  segments.push(silence(ROOM_TONE_END_SEC));
  return concatPcm(segments);
}

/** Build the full ordered list of sections: opening credits, chapters, closing. */
function buildSectionPlans(options: RenderOptions): SectionPlan[] {
  const {
    lines,
    chapters,
    narratorVoiceId,
    narratorLanguageCode,
    narratorVoiceSettings,
    openingCreditsText,
    closingCreditsText,
  } = options;

  const sorted = [...lines].sort((a, b) => a.line_order - b.line_order);
  const sortedChapters = [...chapters].sort(
    (a, b) => a.start_line_order - b.start_line_order
  );

  const plans: SectionPlan[] = [];

  if (narratorVoiceId && openingCreditsText.trim()) {
    plans.push({
      title: "Opening Credits",
      blocks: [
        textToClipRequests(
          openingCreditsText,
          narratorVoiceId,
          narratorLanguageCode,
          narratorVoiceSettings
        ),
      ],
    });
  }

  if (sortedChapters.length === 0) {
    // No chapters detected — render the whole book as one section.
    plans.push({ title: "Audiobook", blocks: chapterToBlocks(sorted) });
  } else {
    for (let c = 0; c < sortedChapters.length; c++) {
      const start = sortedChapters[c]!.start_line_order;
      const end =
        sortedChapters[c + 1]?.start_line_order ?? Number.MAX_SAFE_INTEGER;
      const chapterLines = sorted.filter(
        (l) => l.line_order >= start && l.line_order < end
      );
      plans.push({
        title: sortedChapters[c]!.title,
        blocks: chapterToBlocks(chapterLines),
      });
    }
  }

  if (narratorVoiceId && closingCreditsText.trim()) {
    plans.push({
      title: "Closing Credits",
      blocks: [
        textToClipRequests(
          closingCreditsText,
          narratorVoiceId,
          narratorLanguageCode,
          narratorVoiceSettings
        ),
      ],
    });
  }

  // Drop any empty sections (e.g. a chapter with only uncast/blank lines).
  return plans.filter((p) => p.blocks.some((b) => b.length > 0));
}

async function fetchClipPcm(
  request: ClipRequest,
  signal?: AbortSignal
): Promise<Float32Array> {
  const res = await fetch("/api/voices/render-clip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: request.voice_id,
      text: request.text,
      language_code: request.language_code ?? undefined,
      voice_settings: request.voice_settings ?? undefined,
    }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Clip render failed (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  return decodeToMonoPcm(buffer);
}

/** Render a flat list of clip requests with bounded concurrency, preserving order. */
async function renderClipsConcurrent(
  requests: ClipRequest[],
  concurrency: number,
  onOneDone: () => void,
  signal?: AbortSignal
): Promise<Float32Array[]> {
  const results = new Array<Float32Array>(requests.length);
  let next = 0;

  async function worker() {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const index = next++;
      if (index >= requests.length) return;
      results[index] = await fetchClipPcm(requests[index]!, signal);
      onOneDone();
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, requests.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}

/**
 * Render an entire audiobook to per-chapter MP3 Blobs in the browser.
 * Sections are rendered one at a time to keep memory bounded; within a section,
 * clips render with limited concurrency.
 */
export async function renderAudiobook(
  options: RenderOptions
): Promise<RenderedFile[]> {
  const { onProgress, signal, concurrency = 3 } = options;
  const plans = buildSectionPlans(options);

  const clipsTotal = plans.reduce(
    (sum, plan) => sum + plan.blocks.reduce((s, b) => s + b.length, 0),
    0
  );
  const filesTotal = plans.length;
  const padWidth = Math.max(2, String(filesTotal).length);

  let clipsDone = 0;
  const files: RenderedFile[] = [];

  const report = (phase: RenderProgress["phase"], currentTitle: string, message: string) => {
    onProgress?.({
      phase,
      clipsDone,
      clipsTotal,
      filesDone: files.length,
      filesTotal,
      currentTitle,
      message,
    });
  };

  report("rendering", plans[0]?.title ?? "", "Starting…");

  for (let s = 0; s < plans.length; s++) {
    if (signal?.aborted) throw abortError();
    const plan = plans[s]!;

    // Flatten this section's clip requests (keeping block boundaries for gaps).
    const { flatRequests, blockRanges } = flattenBlocks(plan.blocks);

    report("rendering", plan.title, `Rendering “${plan.title}” voices…`);

    const clipPcms = await renderClipsConcurrent(
      flatRequests,
      concurrency,
      () => {
        clipsDone++;
        report("rendering", plan.title, `Rendering “${plan.title}” voices…`);
      },
      signal
    );

    const chapterPcm = assembleSectionPcm(clipPcms, blockRanges);
    normalizeLoudness(chapterPcm);
    const blob = encodeMp3(chapterPcm);

    files.push({
      filename: `${String(s + 1).padStart(padWidth, "0")}_${slugify(plan.title)}.mp3`,
      title: plan.title,
      blob,
      durationSec: pcmDurationSeconds(chapterPcm),
    });

    report("rendering", plan.title, `Finished “${plan.title}”.`);
  }

  report("done", "", "Render complete.");
  return files;
}

/**
 * Render a single chapter's lines to one mastered MP3 Blob in the browser
 * (no credits). Used for per-chapter export from the Listen page.
 */
export async function renderChapterFile(
  title: string,
  lines: RenderLine[],
  opts: {
    concurrency?: number;
    onProgress?: (clipsDone: number, clipsTotal: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<RenderedFile> {
  const ordered = [...lines].sort((a, b) => a.line_order - b.line_order);
  const blocks = chapterToBlocks(ordered);
  const { flatRequests, blockRanges } = flattenBlocks(blocks);

  if (flatRequests.length === 0) {
    throw new Error("No cast lines to render in this chapter");
  }

  let done = 0;
  const total = flatRequests.length;
  opts.onProgress?.(0, total);

  const clipPcms = await renderClipsConcurrent(
    flatRequests,
    opts.concurrency ?? 3,
    () => {
      done++;
      opts.onProgress?.(done, total);
    },
    opts.signal
  );

  const pcm = assembleSectionPcm(clipPcms, blockRanges);
  normalizeLoudness(pcm);
  const blob = encodeMp3(pcm);

  return {
    filename: `${slugify(title)}.mp3`,
    title,
    blob,
    durationSec: pcmDurationSeconds(pcm),
  };
}
