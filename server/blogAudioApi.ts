declare const process: {
  env: Record<string, string | undefined>;
};

const ZENN_ARTICLES_URL = "https://zenn.dev/api/articles?order=daily";
const ZENN_ARTICLE_URL = "https://zenn.dev/api/articles";
const QIITA_ITEMS_URL = "https://qiita.com/api/v2/items?page=1&per_page=8";
const QIITA_ITEM_URL = "https://qiita.com/api/v2/items";
const ZENN_SEARCH_URL = "https://zenn.dev/api/search";
const ZENN_TOPICS_URL = "https://zenn.dev/api/topics";
const ZENN_BASE_URL = "https://zenn.dev";
const QIITA_BASE_URL = "https://qiita.com";
const GOOGLE_TTS_SYNTHESIZE_URL =
  "https://texttospeech.googleapis.com/v1/text:synthesize";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TTS_INPUT_LIMIT_BYTES = 5_000;
const GOOGLE_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GOOGLE_METADATA_TIMEOUT_MS = 1_000;
const DEFAULT_GOOGLE_CLOUD_TTS_LANGUAGE_CODE = "ja-JP";
const DEFAULT_GOOGLE_CLOUD_TTS_VOICE = "ja-JP-Neural2-B";
const DEFAULT_GOOGLE_CLOUD_TTS_AUDIO_ENCODING = "MP3";
const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;
const ARTICLE_LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const ARTICLE_CONTENT_CACHE_TTL_MS = 30 * 60 * 1000;
const TTS_AUDIO_CACHE_MAX_ENTRIES = 4;
const DEFAULT_ESTIMATED_DURATION_SECONDS = 5 * 60;
const LETTERS_PER_MINUTE = 500;
const SUMMARY_MAX_LENGTH = 120;

type BlogAudioApiOptions = {
  googleApplicationCredentials?: string;
  googleCloudProject?: string;
  googleCloudTtsApiKey?: string;
  googleCloudTtsLanguageCode?: string;
  googleCloudTtsVoice?: string;
  googleCloudTtsAudioEncoding?: string;
};

type ApiHandlerResult = "handled" | "next";

type TtsRequestPayload = {
  chunks?: unknown;
  estimatedDurationSeconds?: unknown;
  narrationVersion?: unknown;
};

type TtsChunk = {
  id: string;
  order: number;
  text: string;
};

type ProviderJsonCacheEntry = {
  cachedAt: number;
  value: unknown;
};

type TtsApiSuccessPayload = {
  audioBase64: string;
  mimeType: "audio/mpeg";
  durationSeconds: number | null;
  source: "google-cloud-tts";
};

type GoogleCloudTtsSettings = {
  applicationCredentialsPath: string | null;
  apiKey: string | null;
  projectId: string | null;
  languageCode: string;
  voiceName: string;
  audioEncoding: "MP3";
};

type GoogleAccessToken = {
  accessToken: string;
  expiresAt: number;
  userProject: string | null;
};

type SupportedArticleUrl = {
  source: "zenn" | "qiita";
  sourceArticleId: string;
};

const providerJsonCache = new Map<string, ProviderJsonCacheEntry>();
const ttsAudioCache = new Map<string, TtsApiSuccessPayload>();
let googleAccessTokenCache: GoogleAccessToken | null = null;

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
      requestUrl.pathname === "/api/article-from-url"
    ) {
      await handleArticleFromUrlRequest(requestUrl, response);
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
    const payload = getErrorPayload(error);

    if (typeof payload.retryAfterSeconds === "number") {
      response.setHeader(
        "Retry-After",
        String(Math.ceil(payload.retryAfterSeconds)),
      );
    }

    sendJson(response, getErrorStatus(error), payload);
    return "handled";
  }
}

async function handleArticlesRequest(requestUrl: URL, response: any) {
  const source = requestUrl.searchParams.get("source");
  const conditions = parseArticleListConditions(requestUrl);

  if (conditions.isSearch) {
    const { query, tag, page, perPage, order } = conditions;

    if (source === "qiita") {
      const providerQuery = [query, tag ? `tag:${tag}` : null]
        .filter((value): value is string => Boolean(value))
        .join(" ");
      const providerUrl = new URL(QIITA_ITEM_URL);
      providerUrl.searchParams.set("query", providerQuery);
      providerUrl.searchParams.set("page", String(page));
      providerUrl.searchParams.set("per_page", String(perPage));
      const payload = await fetchCachedProviderJson({
        url: providerUrl.toString(),
        cacheKey: createArticleSearchCacheKey(source, conditions),
        ttlMs: ARTICLE_LIST_CACHE_TTL_MS,
        staleOnError: true,
      });

      if (!Array.isArray(payload)) {
        throw new ApiError(502, "unsupported_response_shape", "Qiita search response shape is not supported");
      }

      sendJson(response, 200, payload.map(toArticleFromQiita).filter((article) => article !== null));
      return;
    }

    if (source === "zenn") {
      const providerUrl = tag
        ? new URL(`${ZENN_TOPICS_URL}/${encodeURIComponent(tag)}/articles`)
        : new URL(ZENN_SEARCH_URL);

      if (tag) {
        providerUrl.searchParams.set("order", order);
        providerUrl.searchParams.set("page", String(page));
      } else {
        providerUrl.searchParams.set("q", query ?? "");
        providerUrl.searchParams.set("source", "articles");
        providerUrl.searchParams.set("page", String(page));
      }

      const payload = await fetchCachedProviderJson({
        url: providerUrl.toString(),
        cacheKey: createArticleSearchCacheKey(source, conditions),
        ttlMs: ARTICLE_LIST_CACHE_TTL_MS,
        staleOnError: true,
      });
      const rawArticles = getZennArticlesPayload(payload);
      let articles = rawArticles.map(toArticleFromZenn).filter((article) => article !== null);

      if (tag && query) {
        const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase();
        articles = articles.filter((article) =>
          `${article.title} ${article.summary ?? ""}`.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery),
        );
      }

      sendJson(response, 200, articles.slice(0, perPage));
      return;
    }

    throw new ApiError(400, "bad_request", "Unsupported article source");
  }

  if (source === "zenn") {
    const payload = await fetchCachedProviderJson({
      url: ZENN_ARTICLES_URL,
      cacheKey: "articles:zenn:daily",
      ttlMs: ARTICLE_LIST_CACHE_TTL_MS,
      staleOnError: true,
    });

    if (!isRecord(payload) || !Array.isArray(payload.articles)) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Zenn articles response shape is not supported",
      );
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
    const payload = await fetchCachedProviderJson({
      url: QIITA_ITEMS_URL,
      cacheKey: "articles:qiita:latest",
      ttlMs: ARTICLE_LIST_CACHE_TTL_MS,
      staleOnError: true,
    });

    if (!Array.isArray(payload)) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Qiita articles response shape is not supported",
      );
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

type ArticleListConditions = {
  query: string | null;
  tag: string | null;
  page: number;
  perPage: number;
  order: "latest" | "daily";
  isSearch: boolean;
};

function parseArticleListConditions(requestUrl: URL): ArticleListConditions {
  const query = toNonEmptyString(requestUrl.searchParams.get("query"));
  const tag = toNonEmptyString(requestUrl.searchParams.get("tag"));
  const page = parseBoundedInteger(requestUrl.searchParams.get("page"), "page", 1, Number.MAX_SAFE_INTEGER, 1);
  const perPage = parseBoundedInteger(requestUrl.searchParams.get("perPage"), "perPage", 1, 20, 8);
  const rawOrder = requestUrl.searchParams.get("order") ?? (query || tag ? "latest" : "daily");

  if (rawOrder !== "latest" && rawOrder !== "daily") {
    throw new ApiError(400, "bad_request", "Unsupported article order");
  }

  return { query, tag, page, perPage, order: rawOrder, isSearch: Boolean(query || tag) };
}

function parseBoundedInteger(rawValue: string | null, name: string, minimum: number, maximum: number, fallback: number) {
  if (rawValue === null) return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ApiError(400, "bad_request", `${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function createArticleSearchCacheKey(source: string, conditions: ArticleListConditions) {
  return `articles:search:${JSON.stringify({
    source,
    query: conditions.query ?? "",
    tag: conditions.tag ?? "",
    page: conditions.page,
    perPage: conditions.perPage,
    order: conditions.order,
  })}`;
}

function getZennArticlesPayload(payload: unknown): unknown[] {
  if (isRecord(payload) && Array.isArray(payload.articles)) return payload.articles;
  if (Array.isArray(payload)) return payload;
  throw new ApiError(502, "unsupported_response_shape", "Zenn search response shape is not supported");
}

async function handleArticleFromUrlRequest(requestUrl: URL, response: any) {
  const rawUrl = requestUrl.searchParams.get("url");
  const resolvedUrl = resolveSupportedArticleUrl(rawUrl);

  if (resolvedUrl.source === "zenn") {
    const payload = await fetchCachedProviderJson({
      url: `${ZENN_ARTICLE_URL}/${encodeURIComponent(resolvedUrl.sourceArticleId)}`,
      cacheKey: `article-from-url:zenn:${resolvedUrl.sourceArticleId}`,
      ttlMs: ARTICLE_CONTENT_CACHE_TTL_MS,
      staleOnError: true,
    });

    if (!isRecord(payload) || !isRecord(payload.article)) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Zenn article response shape is not supported",
      );
    }

    const article = toArticleFromZenn(payload.article);

    if (!article) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Zenn article response could not be normalized",
      );
    }

    sendJson(response, 200, article);
    return;
  }

  const payload = await fetchCachedProviderJson({
    url: `${QIITA_ITEM_URL}/${encodeURIComponent(resolvedUrl.sourceArticleId)}`,
    cacheKey: `article-from-url:qiita:${resolvedUrl.sourceArticleId}`,
    ttlMs: ARTICLE_CONTENT_CACHE_TTL_MS,
    staleOnError: true,
  });

  const article = toArticleFromQiita(payload);

  if (!article) {
    throw new ApiError(
      502,
      "unsupported_response_shape",
      "Qiita article response could not be normalized",
    );
  }

  sendJson(response, 200, article);
}

async function handleArticleContentRequest(requestUrl: URL, response: any) {
  const source = requestUrl.searchParams.get("source");
  const articleId = requestUrl.searchParams.get("articleId");
  const sourceArticleId = requestUrl.searchParams.get("sourceArticleId");
  const url = requestUrl.searchParams.get("url");

  if (!source || !articleId || !sourceArticleId || !url) {
    throw new ApiError(
      400,
      "bad_request",
      "Article content request is missing required query parameters",
    );
  }

  if (source === "zenn") {
    const payload = await fetchCachedProviderJson({
      url: `${ZENN_ARTICLE_URL}/${encodeURIComponent(sourceArticleId)}`,
      cacheKey: `article-content:zenn:${sourceArticleId}`,
      ttlMs: ARTICLE_CONTENT_CACHE_TTL_MS,
      staleOnError: true,
    });

    if (!isRecord(payload) || !isRecord(payload.article)) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Zenn article content response shape is not supported",
      );
    }

    const bodyHtml = toNonEmptyString(payload.article.body_html);

    if (!bodyHtml) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Zenn article content response did not include article.body_html",
      );
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
    const payload = await fetchCachedProviderJson({
      url: `${QIITA_ITEM_URL}/${encodeURIComponent(sourceArticleId)}`,
      cacheKey: `article-content:qiita:${sourceArticleId}`,
      ttlMs: ARTICLE_CONTENT_CACHE_TTL_MS,
      staleOnError: true,
    });

    if (!isRecord(payload)) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Qiita article content response shape is not supported",
      );
    }

    const markdownBody = toNonEmptyString(payload.body);
    const renderedBody = toNonEmptyString(payload.rendered_body);

    if (!markdownBody && !renderedBody) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Qiita article content response did not include a body",
      );
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
  const settings = getGoogleCloudTtsSettings(options);
  const payload = parseJsonRequestPayload(
    await readRequestText(request),
  ) as TtsRequestPayload;
  const chunks = toTtsChunks(payload.chunks);

  if (chunks.length === 0) {
    throw new ApiError(
      400,
      "bad_request",
      "TTS request did not include narratable chunks",
    );
  }

  const cacheKey = buildTtsCacheKey(payload, chunks, settings);
  const cachedPayload = ttsAudioCache.get(cacheKey);

  if (cachedPayload) {
    sendJson(response, 200, cachedPayload);
    return;
  }

  const providerChunks = chunks.flatMap(splitTtsChunkForProviderLimit);
  const audioContents = await Promise.all(
    providerChunks.map((chunk) =>
      generateGoogleCloudSpeech(chunk.text, settings),
    ),
  );
  const responsePayload: TtsApiSuccessPayload = {
    audioBase64: combineBase64AudioContents(audioContents),
    mimeType: "audio/mpeg",
    durationSeconds: toFiniteNumber(payload.estimatedDurationSeconds),
    source: "google-cloud-tts",
  };

  writeTtsAudioCache(cacheKey, responsePayload);
  sendJson(response, 200, responsePayload);
}

async function generateGoogleCloudSpeech(
  text: string,
  settings: GoogleCloudTtsSettings,
) {
  if (getUtf8ByteLength(text) > GOOGLE_TTS_INPUT_LIMIT_BYTES) {
    throw new ApiError(
      400,
      "tts_input_too_long",
      "A narration chunk exceeds the TTS input limit",
    );
  }

  const authHeaders = await getGoogleCloudAuthHeaders(settings);
  const url = settings.apiKey
    ? `${GOOGLE_TTS_SYNTHESIZE_URL}?key=${encodeURIComponent(settings.apiKey)}`
    : GOOGLE_TTS_SYNTHESIZE_URL;
  const response = await fetchProvider(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      input: {
        text,
      },
      voice: {
        languageCode: settings.languageCode,
        name: settings.voiceName,
      },
      audioConfig: {
        audioEncoding: settings.audioEncoding,
      },
    }),
  });

  const payload = (await response.json()) as unknown;

  if (!isRecord(payload) || typeof payload.audioContent !== "string") {
    throw new ApiError(
      502,
      "unsupported_response_shape",
      "Google Cloud TTS response shape is not supported",
    );
  }

  return payload.audioContent;
}

function getGoogleCloudTtsSettings(
  options: BlogAudioApiOptions,
): GoogleCloudTtsSettings {
  const audioEncoding = (
    toNonEmptyString(options.googleCloudTtsAudioEncoding) ??
    DEFAULT_GOOGLE_CLOUD_TTS_AUDIO_ENCODING
  ).toUpperCase();

  if (audioEncoding !== "MP3") {
    throw new ApiError(
      500,
      "tts_audio_encoding_unsupported",
      "Only MP3 Google Cloud TTS audio is supported by the MVP player",
    );
  }

  return {
    applicationCredentialsPath:
      toNonEmptyString(options.googleApplicationCredentials) ??
      getDefaultApplicationCredentialsPath(),
    apiKey: toNonEmptyString(options.googleCloudTtsApiKey),
    projectId: toNonEmptyString(options.googleCloudProject),
    languageCode:
      toNonEmptyString(options.googleCloudTtsLanguageCode) ??
      DEFAULT_GOOGLE_CLOUD_TTS_LANGUAGE_CODE,
    voiceName:
      toNonEmptyString(options.googleCloudTtsVoice) ??
      DEFAULT_GOOGLE_CLOUD_TTS_VOICE,
    audioEncoding,
  };
}

async function getGoogleCloudAuthHeaders(settings: GoogleCloudTtsSettings) {
  if (settings.apiKey) {
    return {};
  }

  const token = await getGoogleCloudAccessToken(settings);
  const userProject = settings.projectId ?? token.userProject;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
  };

  if (userProject) {
    headers["x-goog-user-project"] = userProject;
  }

  return headers;
}

async function getGoogleCloudAccessToken(settings: GoogleCloudTtsSettings) {
  if (
    googleAccessTokenCache &&
    googleAccessTokenCache.expiresAt - Date.now() > 60_000
  ) {
    return googleAccessTokenCache;
  }

  const credentials = settings.applicationCredentialsPath
    ? await readGoogleCredentials(settings.applicationCredentialsPath)
    : null;
  const token =
    credentials !== null
      ? await exchangeGoogleCredentialsForAccessToken(credentials)
      : await fetchGoogleMetadataAccessToken(settings);

  googleAccessTokenCache = token;
  return token;
}

async function readGoogleCredentials(path: string) {
  const text = await readUtf8File(path);

  if (text === null) {
    return null;
  }

  const payload = parseJsonRequestPayload(text);

  if (!isRecord(payload) || typeof payload.type !== "string") {
    throw new ApiError(
      500,
      "tts_credential_unsupported",
      "Google Cloud credential file shape is not supported",
    );
  }

  return payload;
}

async function exchangeGoogleCredentialsForAccessToken(
  credentials: Record<string, unknown>,
) {
  if (credentials.type === "authorized_user") {
    return refreshAuthorizedUserCredentials(credentials);
  }

  if (credentials.type === "service_account") {
    return exchangeServiceAccountCredentials(credentials);
  }

  throw new ApiError(
    500,
    "tts_credential_unsupported",
    "Google Cloud credential type is not supported",
  );
}

async function refreshAuthorizedUserCredentials(
  credentials: Record<string, unknown>,
) {
  const clientId = toNonEmptyString(credentials.client_id);
  const clientSecret = toNonEmptyString(credentials.client_secret);
  const refreshToken = toNonEmptyString(credentials.refresh_token);
  const tokenUri =
    toNonEmptyString(credentials.token_uri) ?? GOOGLE_OAUTH_TOKEN_URL;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new ApiError(
      500,
      "tts_credential_unsupported",
      "Google Cloud authorized user credential is incomplete",
    );
  }

  const payload = await fetchGoogleTokenPayload(tokenUri, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return toGoogleAccessToken(
    payload,
    toNonEmptyString(credentials.quota_project_id),
  );
}

async function exchangeServiceAccountCredentials(
  credentials: Record<string, unknown>,
) {
  const clientEmail = toNonEmptyString(credentials.client_email);
  const privateKey = toNonEmptyString(credentials.private_key);
  const tokenUri =
    toNonEmptyString(credentials.token_uri) ?? GOOGLE_OAUTH_TOKEN_URL;

  if (!clientEmail || !privateKey) {
    throw new ApiError(
      500,
      "tts_credential_unsupported",
      "Google Cloud service account credential is incomplete",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await signServiceAccountJwt({
    clientEmail,
    privateKey,
    tokenUri,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + 3600,
  });
  const payload = await fetchGoogleTokenPayload(tokenUri, {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  return toGoogleAccessToken(payload, null);
}

async function fetchGoogleTokenPayload(
  tokenUri: string,
  params: Record<string, string>,
) {
  const response = await fetchProvider(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiError(
      502,
      "unsupported_response_shape",
      "Google Cloud auth response was not valid JSON",
    );
  }
}

async function fetchGoogleMetadataAccessToken(
  settings: GoogleCloudTtsSettings,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GOOGLE_METADATA_TIMEOUT_MS);

  try {
    const response = await fetch(GOOGLE_METADATA_TOKEN_URL, {
      headers: {
        "Metadata-Flavor": "Google",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await toProviderApiError(response);
    }

    return toGoogleAccessToken(
      (await response.json()) as unknown,
      settings.projectId,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      501,
      "tts_credential_missing",
      "Google Cloud credentials are required for real TTS generation",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function toGoogleAccessToken(
  payload: unknown,
  userProject: string | null,
): GoogleAccessToken {
  if (!isRecord(payload) || typeof payload.access_token !== "string") {
    throw new ApiError(
      502,
      "unsupported_response_shape",
      "Google Cloud auth response shape is not supported",
    );
  }

  const expiresIn = toFiniteNumber(payload.expires_in) ?? 3600;

  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    userProject,
  };
}

async function signServiceAccountJwt({
  clientEmail,
  privateKey,
  tokenUri,
  issuedAt,
  expiresAt,
}: {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  issuedAt: number;
  expiresAt: number;
}) {
  if (!globalThis.crypto?.subtle) {
    throw new ApiError(
      500,
      "tts_credential_unsupported",
      "Web Crypto is required to sign Google Cloud service account credentials",
    );
  }

  const encodedHeader = base64UrlEncodeText(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );
  const encodedPayload = base64UrlEncodeText(
    JSON.stringify({
      iss: clientEmail,
      scope: GOOGLE_AUTH_SCOPE,
      aud: tokenUri,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );
  const unsignedJwt = `${encodedHeader}.${encodedPayload}`;
  const key = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    decodePemPrivateKey(privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );

  return `${unsignedJwt}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

function decodePemPrivateKey(privateKey: string) {
  return decodeBase64(
    privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, ""),
  );
}

async function readUtf8File(path: string) {
  const fs = (await new Function(
    "specifier",
    "return import(specifier)",
  )("node:fs/promises")) as {
    readFile: (path: string, encoding: "utf8") => Promise<string>;
  };

  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function getDefaultApplicationCredentialsPath() {
  const homeDirectory =
    toNonEmptyString(process.env.HOME) ?? toNonEmptyString(process.env.USERPROFILE);

  if (!homeDirectory) {
    return null;
  }

  return `${homeDirectory}/.config/gcloud/application_default_credentials.json`;
}

async function fetchCachedProviderJson({
  url,
  cacheKey,
  ttlMs,
  staleOnError,
}: {
  url: string;
  cacheKey: string;
  ttlMs: number;
  staleOnError: boolean;
}) {
  const cachedEntry = providerJsonCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.cachedAt <= ttlMs) {
    return cachedEntry.value;
  }

  try {
    const value = await fetchProviderJson(url);
    providerJsonCache.set(cacheKey, {
      cachedAt: Date.now(),
      value,
    });
    return value;
  } catch (error) {
    if (staleOnError && cachedEntry) {
      return cachedEntry.value;
    }

    throw error;
  }
}

async function fetchProviderJson(url: string) {
  const response = await fetchProvider(url, {
    headers: {
      Accept: "application/json",
    },
  });

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiError(
      502,
      "unsupported_response_shape",
      "Provider response was not valid JSON",
    );
  }
}

async function fetchProvider(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await toProviderApiError(response);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        504,
        "provider_timeout",
        "Provider request timed out",
      );
    }

    throw new ApiError(
      502,
      "provider_request_failed",
      "Provider request failed",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function toProviderApiError(response: Response) {
  const retryAfterSeconds = getRetryAfterSeconds(response);
  const providerMessage = await getProviderErrorMessage(response);

  if (response.status === 429) {
    return new ApiError(
      429,
      "rate_limited",
      formatProviderErrorMessage(
        "Provider rate limit reached",
        response,
        providerMessage,
      ),
      retryAfterSeconds,
    );
  }

  if (response.status === 408 || response.status === 504) {
    return new ApiError(
      504,
      "provider_timeout",
      formatProviderErrorMessage(
        "Provider request timed out",
        response,
        providerMessage,
      ),
      retryAfterSeconds,
    );
  }

  if (response.status === 401 || response.status === 403) {
    return new ApiError(
      502,
      "provider_auth_failed",
      formatProviderErrorMessage(
        "Provider authentication or permission failed",
        response,
        providerMessage,
      ),
      retryAfterSeconds,
    );
  }

  return new ApiError(
    502,
    "provider_request_failed",
    formatProviderErrorMessage(
      "Provider request failed",
      response,
      providerMessage,
    ),
    retryAfterSeconds,
  );
}

async function getProviderErrorMessage(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.clone().json()) as unknown;
      const message = getProviderJsonErrorMessage(payload);

      if (message) {
        return message;
      }
    }

    const text = (await response.clone().text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

function getProviderJsonErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const error = isRecord(payload.error) ? payload.error : null;
  const errorMessage = error ? toNonEmptyString(error.message) : null;

  if (errorMessage) {
    return errorMessage;
  }

  return toNonEmptyString(payload.message);
}

function formatProviderErrorMessage(
  prefix: string,
  response: Response,
  providerMessage: string | null,
) {
  if (!providerMessage) {
    return `${prefix}: ${response.status}`;
  }

  const normalizedMessage = providerMessage.replace(/\s+/g, " ").trim();
  const truncatedMessage =
    normalizedMessage.length > 240
      ? `${normalizedMessage.slice(0, 237).trim()}...`
      : normalizedMessage;

  return `${prefix}: ${response.status}. ${truncatedMessage}`;
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

function splitTtsChunkForProviderLimit(chunk: TtsChunk): TtsChunk[] {
  if (getUtf8ByteLength(chunk.text) <= GOOGLE_TTS_INPUT_LIMIT_BYTES) {
    return [chunk];
  }

  return splitTextForProviderLimit(chunk.text, GOOGLE_TTS_INPUT_LIMIT_BYTES).map(
    (text, index) => ({
      ...chunk,
      id: `${chunk.id}:part:${index + 1}`,
      order: chunk.order + index / 1000,
      text,
    }),
  );
}

function splitTextForProviderLimit(text: string, maxBytes: number) {
  const sentences = text
    .match(/[^。！？.!?]+[。！？.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences?.length) {
    return splitLongTextForProviderLimit(text, maxBytes);
  }

  const parts: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    if (getUtf8ByteLength(sentence) > maxBytes) {
      if (current) {
        parts.push(current);
        current = "";
      }

      parts.push(...splitLongTextForProviderLimit(sentence, maxBytes));
      return;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;

    if (getUtf8ByteLength(candidate) > maxBytes && current) {
      parts.push(current);
      current = sentence;
      return;
    }

    current = candidate;
  });

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitLongTextForProviderLimit(text: string, maxBytes: number) {
  const parts: string[] = [];
  let current = "";

  for (const character of text) {
    const candidate = `${current}${character}`;

    if (current && getUtf8ByteLength(candidate) > maxBytes) {
      parts.push(current);
      current = character;
      continue;
    }

    current = candidate;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function buildTtsCacheKey(
  payload: TtsRequestPayload,
  chunks: TtsChunk[],
  settings: GoogleCloudTtsSettings,
) {
  return JSON.stringify({
    provider: "google-cloud-tts",
    languageCode: settings.languageCode,
    voice: settings.voiceName,
    audioEncoding: settings.audioEncoding,
    narrationVersion: toNonEmptyString(payload.narrationVersion),
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      order: chunk.order,
      text: chunk.text,
    })),
  });
}

function writeTtsAudioCache(cacheKey: string, payload: TtsApiSuccessPayload) {
  ttsAudioCache.set(cacheKey, payload);

  while (ttsAudioCache.size > TTS_AUDIO_CACHE_MAX_ENTRIES) {
    const firstKey = ttsAudioCache.keys().next().value;

    if (typeof firstKey !== "string") {
      break;
    }

    ttsAudioCache.delete(firstKey);
  }
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

function resolveSupportedArticleUrl(rawUrl: string | null): SupportedArticleUrl {
  const articleUrl = toNonEmptyString(rawUrl);

  if (!articleUrl) {
    throw new ApiError(
      400,
      "bad_request",
      "Article URL is required",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(articleUrl);
  } catch {
    throw new ApiError(
      400,
      "bad_request",
      "Article URL must be a valid URL",
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new ApiError(
      400,
      "unsupported_article_url",
      "Only HTTPS Zenn or Qiita article URLs are supported",
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

  if (hostname === "zenn.dev") {
    return resolveZennArticleUrl(pathParts);
  }

  if (hostname === "qiita.com") {
    return resolveQiitaArticleUrl(pathParts);
  }

  throw new ApiError(
    400,
    "unsupported_article_url",
    "Only Zenn or Qiita article URLs are supported",
  );
}

function resolveZennArticleUrl(pathParts: string[]): SupportedArticleUrl {
  const articleSegmentIndex = pathParts.indexOf("articles");
  const sourceArticleId =
    articleSegmentIndex >= 1
      ? toNonEmptyString(pathParts[articleSegmentIndex + 1])
      : null;

  if (!sourceArticleId) {
    throw new ApiError(
      400,
      "unsupported_article_url",
      "Zenn article URL must include /articles/{slug}",
    );
  }

  return {
    source: "zenn",
    sourceArticleId,
  };
}

function resolveQiitaArticleUrl(pathParts: string[]): SupportedArticleUrl {
  const itemSegmentIndex = pathParts.indexOf("items");
  const sourceArticleId =
    itemSegmentIndex >= 1
      ? toNonEmptyString(pathParts[itemSegmentIndex + 1])
      : null;

  if (!sourceArticleId) {
    throw new ApiError(
      400,
      "unsupported_article_url",
      "Qiita article URL must include /items/{id}",
    );
  }

  return {
    source: "qiita",
    sourceArticleId,
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

function parseJsonRequestPayload(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON");
  }
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

function getErrorPayload(error: unknown) {
  const payload: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  } = {
    code: getErrorCode(error),
    message:
      error instanceof Error ? error.message : "API request could not be handled",
  };

  if (
    error instanceof ApiError &&
    typeof error.retryAfterSeconds === "number"
  ) {
    payload.retryAfterSeconds = error.retryAfterSeconds;
  }

  return payload;
}

function getRetryAfterSeconds(response: Response) {
  const retryAfter = response.headers.get("Retry-After");

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds;
  }

  const retryAfterDate = Date.parse(retryAfter);

  if (!Number.isFinite(retryAfterDate)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAfterDate - Date.now()) / 1000));
}

function combineBase64AudioContents(audioContents: string[]) {
  if (audioContents.length === 1) {
    return audioContents[0] ?? "";
  }

  return encodeBase64(concatenateByteArrays(audioContents.map(decodeBase64)));
}

function concatenateByteArrays(arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((length, bytes) => length + bytes.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  arrays.forEach((bytes) => {
    output.set(bytes, offset);
    offset += bytes.length;
  });

  return output;
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

function decodeBase64(base64: string) {
  const normalized = base64.replace(/\s/g, "");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 4) {
    const thirdCharacter = normalized[index + 2] ?? "";
    const fourthCharacter = normalized[index + 3] ?? "";
    const first = alphabet.indexOf(normalized[index] ?? "");
    const second = alphabet.indexOf(normalized[index + 1] ?? "");
    const third =
      thirdCharacter === "=" ? -1 : alphabet.indexOf(thirdCharacter);
    const fourth =
      fourthCharacter === "=" ? -1 : alphabet.indexOf(fourthCharacter);

    if (
      first < 0 ||
      second < 0 ||
      (thirdCharacter !== "=" && third < 0) ||
      (fourthCharacter !== "=" && fourth < 0)
    ) {
      throw new ApiError(
        502,
        "unsupported_response_shape",
        "Provider returned invalid base64 audio",
      );
    }

    const triplet =
      (first << 18) |
      (second << 12) |
      ((third < 0 ? 0 : third) << 6) |
      (fourth < 0 ? 0 : fourth);
    bytes.push((triplet >> 16) & 255);

    if (third >= 0) {
      bytes.push((triplet >> 8) & 255);
    }

    if (fourth >= 0) {
      bytes.push(triplet & 255);
    }
  }

  return new Uint8Array(bytes);
}

function base64UrlEncodeText(text: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  return encodeBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getUtf8ByteLength(text: string) {
  return new TextEncoder().encode(text).length;
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
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
