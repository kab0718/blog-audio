import type { PlaybackResource } from "../types/audioTrack";
import type { NarrationScript } from "../types/narration";

export type GeneratedAudioResource = {
  playbackResource: PlaybackResource;
  durationSeconds: number;
};

const SAMPLE_RATE = 8_000;

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
      url: createSilentWavObjectUrl(
        normalizePreviewDuration(script.estimatedDurationSeconds),
      ),
    },
    durationSeconds: script.estimatedDurationSeconds,
  };
}

function waitForPreviewGeneration() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 450);
  });
}

function createSilentWavObjectUrl(durationSeconds: number) {
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

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
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
