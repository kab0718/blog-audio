import type { NarrationScript } from "../types/narration";
import {
  generateLocalPreviewAudioResource,
  type GeneratedAudioResource,
} from "./localPreviewTtsAdapter";

type TtsApiResponse = {
  audioBase64?: unknown;
  mimeType?: unknown;
  durationSeconds?: unknown;
  source?: unknown;
};

type TtsApiError = {
  code?: unknown;
  message?: unknown;
};

type TtsErrorInfo = {
  code: string | null;
  message: string;
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
    const errorInfo = await getTtsErrorInfo(response);

    if (errorInfo.code === "tts_api_key_missing") {
      return generateLocalPreviewAudioResource(script);
    }

    throw new Error(errorInfo.message);
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
    source: "openai-tts",
  };
}

async function getTtsErrorInfo(response: Response): Promise<TtsErrorInfo> {
  try {
    const payload = (await response.json()) as TtsApiError;
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";

    return {
      code: code || null,
      message: message || `TTS API request failed: ${response.status}`,
    };
  } catch {
    return {
      code: null,
      message: `TTS API request failed: ${response.status}`,
    };
  }
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}
