import { getApiErrorMessage } from "../api/apiError";
import type { NarrationScript } from "../types/narration";
import type { GeneratedAudioResource } from "./localPreviewTtsAdapter";

type TtsApiResponse = {
  audioBase64?: unknown;
  mimeType?: unknown;
  durationSeconds?: unknown;
  source?: unknown;
};

export async function generateRealTtsAudioResource(
  script: NarrationScript,
): Promise<GeneratedAudioResource> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      chunks: script.textChunks.map((chunk) => ({
        id: chunk.id,
        order: chunk.order,
        text: chunk.text,
      })),
      estimatedDurationSeconds: script.estimatedDurationSeconds,
      narrationVersion: script.version,
    }),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, "TTS API request failed"));
  }

  const payload = (await response.json()) as TtsApiResponse;

  if (
    typeof payload.audioBase64 !== "string" ||
    typeof payload.mimeType !== "string"
  ) {
    throw new Error("TTS API response shape is not supported");
  }

  return {
    playbackResource: {
      kind: "url",
      url: URL.createObjectURL(
        base64ToBlob(payload.audioBase64, payload.mimeType),
      ),
    },
    durationSeconds:
      typeof payload.durationSeconds === "number" &&
      Number.isFinite(payload.durationSeconds)
        ? payload.durationSeconds
        : script.estimatedDurationSeconds,
    source: "google-cloud-tts",
  };
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}
