const ZENN_ARTICLES_URL = "https://zenn.dev/api/articles?order=daily";
const ZENN_ARTICLE_URL = "https://zenn.dev/api/articles";
const QIITA_ITEMS_URL = "https://qiita.com/api/v2/items?page=1&per_page=8";
const QIITA_ITEM_URL = "https://qiita.com/api/v2/items";
const ZENN_BASE_URL = "https://zenn.dev";
const QIITA_BASE_URL = "https://qiita.com";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = "marin";
const OPENAI_TTS_INPUT_LIMIT = 4096;
const DEFAULT_ESTIMATED_DURATION_SECONDS = 5 * 60;
const LETTERS_PER_MINUTE = 500;
const SUMMARY_MAX_LENGTH = 120;

type BlogAudioApiOptions = {
  openAiApiKey?: string;
};

type ApiHandlerResult = "handled" | "next";

type TtsRequestPayload = {
  chunks?: unknown;
  estimatedDurationSeconds?: unknown;
};

type TtsChunk = {
  id: string;
  order: number;
  text: string;
};

type ParsedWave = {
  bytes: Uint8Array;
  dataStart: number;
  dataSize: number;
  dataSizeOffset: number;
  audioFormat: number;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
};

export function blogAudioApiPlugin(options: BlogAudioApiOptions) {
  return {
    name: "blog-audio-api",
    configureServer(server: any) {
      server.middlewares.use((request: any, response: any, next: () => void) => {
        void handleApiRequest(request, response, options).then((result) => {
          if (result === "next") {
            next();
          }
        });
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((request: any, response: any, next: () => void) => {
        void handleApiRequest(request, response, options).then((result) => {
          if (result === "next") {
            next();
          }
        });
      });
    },
  };
}

async function handleApiRequest(
  request: any,
  response: any,
  options: BlogAudioApiOptions,
): Promise<ApiHandlerResult> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/articles") {
      await handleArticlesRequest(requestUrl, response);
      return "handled";
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/article-content"
    ) {
      await handleArticleContentRequest(requestUrl, response);
      return "handled";
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/tts") {
      await handleTtsRequest(request, response, options);
      return "handled";
    }

    return "next";
  } catch (error) {
    sendJson(response, getErrorStatus(error), {
      code: getErrorCode(error),
      message:
        error instanceof Error ? error.message : "API request could not be handled",
    });
    return "handled";
  }
}

async function handleArticlesRequest(requestUrl: URL, response: any) {
  const source = requestUrl.searchParams.get("source");

  if (source === "zenn") {
    const payload = await fetchJson(ZENN_ARTICLES_URL);

    if (!isRecord(payload) || !Array.isArray(payload.articles)) {
      throw new ApiError(502, "unsupported_response_shape", "Zenn articles response shape is not supported");
    }

    sendJson(
      response,
      200,
      payload.articles
        .map((article) => toArticleFromZenn(article))
        .filter((article) => article !== null),
    );
    return;
  }

  if (source === "qiita") {
    const payload = await fetchJson(QIITA_ITEMS_URL);

    if (!Array.isArray(payload)) {
      throw new ApiError(502, "unsupported_response_shape", "Qiita articles response shape is not supported");
    }

    sendJson(
      response,
      200,
      payload
        .map((item) => toArticleFromQiita(item))
        .filter((article) => article !== null),
    );
    return;
  }

  throw new ApiError(400, "bad_request", "Unsupported article source");
}

async function handleArticleContentRequest(requestUrl: URL, response: any) {
  const source = requestUrl.searchParams.get("source");
  const articleId = requestUrl.searchParams.get("articleId");
  const sourceArticleId = requestUrl.searchParams.get("sourceArticleId");
  const url = requestUrl.searchParams.get("url");

  if (!source || !articleId || !sourceArticleId || !url) {
    throw new ApiError(400, "bad_request", "Article content request is missing required query parameters");
  }

  if (source === "zenn") {
    const payload = await fetchJson(
      `${ZENN_ARTICLE_URL}/${encodeURIComponent(sourceArticleId)}`,
    );

    if (!isRecord(payload) || !isRecord(payload.article)) {
      throw new ApiError(502, "unsupported_response_shape", "Zenn article content response shape is not supported");
    }

    const bodyHtml = toNonEmptyString(payload.article.body_html);

    if (!bodyHtml) {
      throw new ApiError(502, "unsupported_response_shape", "Zenn article content response did not include article.body_html");
    }

    sendJson(response, 200, {
      articleId,
      sourceType: "zenn",
      sourceArticleId,
      url,
      format: "html",
      body: bodyHtml,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (source === "qiita") {
    const payload = await fetchJson(
      `${QIITA_ITEM_URL}/${encodeURIComponent(sourceArticleId)}`,
    );

    if (!isRecord(payload)) {
      throw new ApiError(502, "unsupported_response_shape", "Qiita article content response shape is not supported");
    }

    const markdownBody = toNonEmptyString(payload.body);
    const renderedBody = toNonEmptyString(payload.rendered_body);

    if (!markdownBody && !renderedBody) {
      throw new ApiError(502, "unsupported_response_shape", "Qiita article content response did not include a body");
    }

    sendJson(response, 200, {
      articleId,
      sourceType: "qiita",
      sourceArticleId,
      url,
      format: markdownBody ? "markdown" : "html",
      body: markdownBody ?? renderedBody,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  throw new ApiError(400, "bad_request", "Unsupported article content source");
}

async function handleTtsRequest(
  request: any,
  response: any,
  options: BlogAudioApiOptions,
) {
  if (!options.openAiApiKey) {
    throw new ApiError(501, "tts_api_key_missing", "OPENAI_API_KEY is required for real TTS generation");
  }

  const payload = JSON.parse(await readRequestText(request)) as TtsRequestPayload;
  const chunks = toTtsChunks(payload.chunks);

  if (chunks.length === 0) {
    throw new ApiError(400, "bad_request", "TTS request did not include narratable chunks");
  }

  const waveFiles = await Promise.all(
    chunks.map((chunk) => generateOpenAiSpeech(chunk.text, options.openAiApiKey!)),
  );
  const combinedWave = concatenateWaveFiles(waveFiles);

  sendJson(response, 200, {
    audioBase64: encodeBase64(combinedWave.bytes),
    mimeType: "audio/wav",
    durationSeconds:
      combinedWave.durationSeconds ??
      toFiniteNumber(payload.estimatedDurationSeconds),
    source: "openai-tts",
  });
}

async function generateOpenAiSpeech(text: string, openAiApiKey: string) {
  if (text.length > OPENAI_TTS_INPUT_LIMIT) {
    throw new ApiError(400, "tts_input_too_long", "A narration chunk exceeds the TTS input limit");
  }

  const response = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      instructions:
        "Read this technical blog narration clearly in Japanese when the text is Japanese. Keep code explanations concise and natural.",
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "tts_provider_failed",
      `OpenAI speech request failed: ${response.status}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "provider_request_failed",
      `Provider request failed: ${response.status}`,
    );
  }

  return response.json() as Promise<unknown>;
}

function concatenateWaveFiles(waveFiles: Uint8Array[]) {
  const parsedWaves = waveFiles.map(parseWaveFile);
  const firstWave = parsedWaves[0];

  if (!firstWave) {
    throw new ApiError(500, "tts_audio_empty", "TTS provider returned no audio");
  }

  parsedWaves.forEach((wave) => {
    if (!isCompatibleWave(firstWave, wave)) {
      throw new ApiError(502, "tts_audio_incompatible", "TTS provider returned incompatible audio chunks");
    }
  });

  const totalDataSize = parsedWaves.reduce(
    (size, wave) => size + wave.dataSize,
    0,
  );
  const output = new Uint8Array(firstWave.dataStart + totalDataSize);
  output.set(firstWave.bytes.slice(0, firstWave.dataStart), 0);

  let writeOffset = firstWave.dataStart;

  parsedWaves.forEach((wave) => {
    output.set(
      wave.bytes.slice(wave.dataStart, wave.dataStart + wave.dataSize),
      writeOffset,
    );
    writeOffset += wave.dataSize;
  });

  const view = new DataView(output.buffer);
  view.setUint32(4, output.length - 8, true);
  view.setUint32(firstWave.dataSizeOffset, totalDataSize, true);

  return {
    bytes: output,
    durationSeconds:
      totalDataSize /
      (firstWave.sampleRate *
        firstWave.channelCount *
        (firstWave.bitsPerSample / 8)),
  };
}

function parseWaveFile(bytes: Uint8Array): ParsedWave {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    throw new ApiError(502, "tts_audio_unsupported", "TTS provider did not return a WAV file");
  }

  let offset = 12;
  let audioFormat: number | null = null;
  let channelCount: number | null = null;
  let sampleRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataStart: number | null = null;
  let dataSize: number | null = null;
  let dataSizeOffset: number | null = null;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkDataStart, true);
      channelCount = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    }

    if (chunkId === "data") {
      dataStart = chunkDataStart;
      dataSize = chunkSize;
      dataSizeOffset = offset + 4;
      break;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat === null ||
    channelCount === null ||
    sampleRate === null ||
    bitsPerSample === null ||
    dataStart === null ||
    dataSize === null ||
    dataSizeOffset === null
  ) {
    throw new ApiError(502, "tts_audio_unsupported", "TTS provider returned unsupported WAV data");
  }

  return {
    bytes,
    dataStart,
    dataSize,
    dataSizeOffset,
    audioFormat,
    channelCount,
    sampleRate,
    bitsPerSample,
  };
}

function isCompatibleWave(first: ParsedWave, next: ParsedWave) {
  return (
    first.audioFormat === next.audioFormat &&
    first.channelCount === next.channelCount &&
    first.sampleRate === next.sampleRate &&
    first.bitsPerSample === next.bitsPerSample
  );
}

function toTtsChunks(chunks: unknown): TtsChunk[] {
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .map((chunk) => {
      if (!isRecord(chunk)) {
        return null;
      }

      const id = toNonEmptyString(chunk.id);
      const order = toFiniteNumber(chunk.order);
      const text = toNonEmptyString(chunk.text);

      if (!id || order === null || !text) {
        return null;
      }

      return { id, order, text };
    })
    .filter((chunk): chunk is TtsChunk => chunk !== null)
    .sort((first, second) => first.order - second.order);
}

function toArticleFromZenn(rawArticle: unknown) {
  if (!isRecord(rawArticle)) {
    return null;
  }

  const title = toNonEmptyString(rawArticle.title);
  const sourceArticleId = getZennSourceArticleId(rawArticle);
  const user = isRecord(rawArticle.user) ? rawArticle.user : null;
  const username = user ? toNonEmptyString(user.username) : null;
  const author = (user ? toNonEmptyString(user.name) : null) ?? username;
  const url = getZennArticleUrl(rawArticle, username, sourceArticleId);

  if (!title || !sourceArticleId || !author || !url) {
    return null;
  }

  return {
    id: `zenn:${sourceArticleId}`,
    sourceType: "zenn",
    sourceArticleId,
    title,
    author,
    url,
    estimatedDurationSeconds: estimateDurationSecondsFromLetters(
      toFiniteNumber(rawArticle.body_letters_count),
    ),
    tags: getZennTopicNames(rawArticle.topics),
    summary: toNonEmptyString(rawArticle.description) ?? undefined,
  };
}

function toArticleFromQiita(rawItem: unknown) {
  if (!isRecord(rawItem)) {
    return null;
  }

  const sourceArticleId = toNonEmptyString(rawItem.id);
  const title = toNonEmptyString(rawItem.title);
  const user = isRecord(rawItem.user) ? rawItem.user : null;
  const userId = user ? toNonEmptyString(user.id) : null;
  const author = (user ? toNonEmptyString(user.name) : null) ?? userId;
  const url = getQiitaArticleUrl(rawItem, userId, sourceArticleId);
  const body = toNonEmptyString(rawItem.body);

  if (!sourceArticleId || !title || !author || !url) {
    return null;
  }

  return {
    id: `qiita:${sourceArticleId}`,
    sourceType: "qiita",
    sourceArticleId,
    title,
    author,
    url,
    estimatedDurationSeconds: estimateDurationSecondsFromText(body),
    tags: getQiitaTagNames(rawItem.tags),
    summary: buildQiitaSummary(body) ?? undefined,
  };
}

function getZennSourceArticleId(article: Record<string, unknown>) {
  const slug = toNonEmptyString(article.slug);

  if (slug) {
    return slug;
  }

  const id = toNonEmptyString(article.id);

  if (id) {
    return id;
  }

  const path = toNonEmptyString(article.path);

  if (!path) {
    return null;
  }

  const pathParts = path.split("/").filter(Boolean);

  return pathParts[pathParts.length - 1] ?? null;
}

function getZennArticleUrl(
  article: Record<string, unknown>,
  username: string | null,
  sourceArticleId: string | null,
) {
  const path = toNonEmptyString(article.path);

  if (path?.startsWith("https://")) {
    return path;
  }

  if (path?.startsWith("/")) {
    return `${ZENN_BASE_URL}${path}`;
  }

  if (!username || !sourceArticleId) {
    return null;
  }

  return `${ZENN_BASE_URL}/${username}/articles/${sourceArticleId}`;
}

function getQiitaArticleUrl(
  item: Record<string, unknown>,
  userId: string | null,
  sourceArticleId: string | null,
) {
  const url = toNonEmptyString(item.url);

  if (url?.startsWith("https://")) {
    return url;
  }

  if (!userId || !sourceArticleId) {
    return null;
  }

  return `${QIITA_BASE_URL}/${userId}/items/${sourceArticleId}`;
}

function estimateDurationSecondsFromLetters(bodyLettersCount: number | null) {
  if (!bodyLettersCount || bodyLettersCount <= 0) {
    return DEFAULT_ESTIMATED_DURATION_SECONDS;
  }

  return Math.max(
    60,
    Math.ceil(bodyLettersCount / LETTERS_PER_MINUTE) * 60,
  );
}

function estimateDurationSecondsFromText(body: string | null) {
  if (!body) {
    return DEFAULT_ESTIMATED_DURATION_SECONDS;
  }

  return Math.max(60, Math.ceil(body.length / LETTERS_PER_MINUTE) * 60);
}

function getZennTopicNames(topics: unknown) {
  if (!Array.isArray(topics)) {
    return [];
  }

  return topics
    .map((topic) => {
      if (!isRecord(topic)) {
        return null;
      }

      return toNonEmptyString(topic.name);
    })
    .filter((topic): topic is string => topic !== null);
}

function getQiitaTagNames(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => {
      if (!isRecord(tag)) {
        return null;
      }

      return toNonEmptyString(tag.name);
    })
    .filter((tag): tag is string => tag !== null);
}

function buildQiitaSummary(body: string | null) {
  if (!body) {
    return null;
  }

  const summary = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~\-]{2,}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!summary) {
    return null;
  }

  if (summary.length <= SUMMARY_MAX_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, SUMMARY_MAX_LENGTH).trim()}...`;
}

async function readRequestText(request: any) {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of request) {
    const bytes =
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  const body = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.length;
  });

  return new TextDecoder().decode(body);
}

function sendJson(response: any, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function getErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : 500;
}

function getErrorCode(error: unknown) {
  return error instanceof ApiError ? error.code : "internal_error";
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }

  return value;
}

function encodeBase64(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;

    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triplet & 63] : "=";
  }

  return output;
}

function toNonEmptyString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
