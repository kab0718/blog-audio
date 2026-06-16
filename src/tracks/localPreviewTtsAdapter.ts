import type { PlaybackResource } from "../types/audioTrack";
import type { NarrationScript } from "../types/narration";

export type GeneratedAudioResource = {
  playbackResource: PlaybackResource;
  durationSeconds: number;
  source: "local-preview" | "openai-tts";
};

const SAMPLE_RATE = 8_000;
const PREVIEW_TONE_AMPLITUDE = 0.08;
const PREVIEW_TONE_SECONDS = 0.18;
const PREVIEW_TONE_INTERVAL_SECONDS = 1.4;

export async function generateLocalPreviewAudioResource(
  script: NarrationScript,
): Promise<GeneratedAudioResource> {
  if (!script.text.trim()) {
    throw new Error("Narration script is empty");
  }

  await waitForPreviewGeneration();

  return {
    playbackResource: {
      kind: "url",
      url: createPreviewWavObjectUrl(
        normalizePreviewDuration(script.estimatedDurationSeconds),
      ),
    },
    durationSeconds: script.estimatedDurationSeconds,
    source: "local-preview",
  };
}

function waitForPreviewGeneration() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 450);
  });
}

function createPreviewWavObjectUrl(durationSeconds: number) {
  const sampleCount = Math.max(1, Math.floor(SAMPLE_RATE * durationSeconds));
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  writePreviewToneSamples(view, sampleCount);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function writePreviewToneSamples(view: DataView, sampleCount: number) {
  const maxAmplitude = 32767 * PREVIEW_TONE_AMPLITUDE;
  const toneSampleCount = Math.floor(SAMPLE_RATE * PREVIEW_TONE_SECONDS);
  const intervalSampleCount = Math.max(
    toneSampleCount,
    Math.floor(SAMPLE_RATE * PREVIEW_TONE_INTERVAL_SECONDS),
  );

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const intervalPosition = sampleIndex % intervalSampleCount;

    if (intervalPosition >= toneSampleCount) {
      continue;
    }

    const envelope = Math.sin(
      Math.PI * (intervalPosition / Math.max(1, toneSampleCount - 1)),
    );
    const frequency = sampleIndex % (intervalSampleCount * 2) < intervalSampleCount
      ? 440
      : 554.37;
    const sample =
      Math.sin((2 * Math.PI * frequency * sampleIndex) / SAMPLE_RATE) *
      maxAmplitude *
      envelope;

    view.setInt16(44 + sampleIndex * 2, sample, true);
  }
}

function normalizePreviewDuration(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(durationSeconds));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
