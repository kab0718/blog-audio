import type { Article } from "../../types/article";
import type { RawArticleContentInput } from "../../types/articleContent";

const ZENN_BASE_URL = "https://zenn.dev";
const ZENN_DAILY_POPULAR_ARTICLES_URL = "/api/articles?source=zenn&order=daily";
const ZENN_ARTICLE_CONTENT_URL = "/api/article-content";
const DEFAULT_ESTIMATED_DURATION_SECONDS = 5 * 60;
const LETTERS_PER_MINUTE = 500;
const ZENN_ARTICLES_CACHE_KEY = "blog-audio:zenn-daily-popular-articles:v1";

type ZennArticlesCachePayload = {
  cachedAt: number | null;
  cacheDate: string | null;
  lastAttemptDate: string | null;
  retryAfterUntil: number | null;
  articles: Article[];
};

let zennDailyPopularArticlesRequest: Promise<Article[]> | null = null;
let zennDailyPopularArticlesMemoryCache: ZennArticlesCachePayload | null = null;

export type ZennArticleResponse = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  path?: unknown;
  body_letters_count?: unknown;
  description?: unknown;
  user?: {
    username?: unknown;
    name?: unknown;
  };
  topics?: unknown;
};

export type ZennArticleDetailResponse = {
  article?: {
    body_html?: unknown;
  };
};

export async function fetchZennDailyPopularArticles(): Promise<Article[]> {
  const today = getLocalDateKey(new Date());
  const cachedPayload = readZennArticlesCache();

  if (cachedPayload?.cacheDate === today) {
    return cachedPayload.articles;
  }

  if (cachedPayload?.lastAttemptDate === today) {
    if (cachedPayload.articles.length > 0) {
      return cachedPayload.articles;
    }

    throw new Error("Zenn articles request already failed today");
  }

  if (zennDailyPopularArticlesRequest) {
    return zennDailyPopularArticlesRequest;
  }

  zennDailyPopularArticlesRequest = fetchFreshZennDailyPopularArticles(
    today,
    cachedPayload,
  );

  try {
    return await zennDailyPopularArticlesRequest;
  } finally {
    zennDailyPopularArticlesRequest = null;
  }
}

export async function fetchZennArticleContent(
  article: Article,
): Promise<RawArticleContentInput> {
  if (article.sourceType !== "zenn") {
    throw new Error("Zenn content fetcher received a non-Zenn article");
  }

  const requestUrl = new URL(ZENN_ARTICLE_CONTENT_URL, window.location.origin);
  requestUrl.searchParams.set("source", article.sourceType);
  requestUrl.searchParams.set("articleId", article.id);
  requestUrl.searchParams.set("sourceArticleId", article.sourceArticleId);
  requestUrl.searchParams.set("url", article.url);

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Zenn article content request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isRawZennArticleContentInput(payload, article.id)) {
    throw new Error("Zenn article content response shape is not supported");
  }

  return payload;
}

export function toArticleFromZenn(rawArticle: unknown): Article | null {
  if (!isRecord(rawArticle)) {
    return null;
  }

  const title = toNonEmptyString(rawArticle.title);
  const sourceArticleId = getSourceArticleId(rawArticle);
  const user = isRecord(rawArticle.user) ? rawArticle.user : null;
  const username = user ? toNonEmptyString(user.username) : null;
  const author = (user ? toNonEmptyString(user.name) : null) ?? username;
  const url = getArticleUrl(rawArticle, username, sourceArticleId);

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
    estimatedDurationSeconds: estimateDurationSeconds(
      toNumber(rawArticle.body_letters_count),
    ),
    tags: getTopicNames(rawArticle.topics),
    summary: toNonEmptyString(rawArticle.description) ?? undefined,
  };
}

async function fetchFreshZennDailyPopularArticles(
  today: string,
  cachedPayload: ZennArticlesCachePayload | null,
) {
  const response = await fetch(ZENN_DAILY_POPULAR_ARTICLES_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    writeZennArticlesCache({
      ...createEmptyZennArticlesCache(),
      ...cachedPayload,
      lastAttemptDate: today,
      retryAfterUntil: getRetryAfterUntil(response),
    });

    if (cachedPayload?.articles.length) {
      return cachedPayload.articles;
    }

    throw new Error(`Zenn articles request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    writeZennArticlesCache({
      ...createEmptyZennArticlesCache(),
      ...cachedPayload,
      lastAttemptDate: today,
      retryAfterUntil: null,
    });

    if (cachedPayload?.articles.length) {
      return cachedPayload.articles;
    }

    throw new Error("Zenn articles response shape is not supported");
  }

  const articles = payload.filter(isArticle);

  writeZennArticlesCache({
    cachedAt: Date.now(),
    cacheDate: today,
    lastAttemptDate: today,
    retryAfterUntil: null,
    articles,
  });

  return articles;
}

function readZennArticlesCache() {
  try {
    const serializedPayload = getZennArticlesStorage()?.getItem(
      ZENN_ARTICLES_CACHE_KEY,
    );

    if (!serializedPayload) {
      return zennDailyPopularArticlesMemoryCache;
    }

    const payload: unknown = JSON.parse(serializedPayload);

    return (
      toZennArticlesCachePayload(payload) ?? zennDailyPopularArticlesMemoryCache
    );
  } catch {
    return zennDailyPopularArticlesMemoryCache;
  }
}

function writeZennArticlesCache(payload: ZennArticlesCachePayload) {
  zennDailyPopularArticlesMemoryCache = payload;

  try {
    getZennArticlesStorage()?.setItem(
      ZENN_ARTICLES_CACHE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Cache failures should not block article ingestion.
  }
}

function getZennArticlesStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function toZennArticlesCachePayload(
  payload: unknown,
): ZennArticlesCachePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (!Array.isArray(payload.articles)) {
    return null;
  }

  const articles = payload.articles.filter(isArticle);

  if (articles.length !== payload.articles.length) {
    return null;
  }

  return {
    cachedAt: toFiniteNumber(payload.cachedAt),
    cacheDate: toNonEmptyString(payload.cacheDate),
    lastAttemptDate: toNonEmptyString(payload.lastAttemptDate),
    retryAfterUntil: toFiniteNumber(payload.retryAfterUntil),
    articles,
  };
}

function createEmptyZennArticlesCache(): ZennArticlesCachePayload {
  return {
    cachedAt: null,
    cacheDate: null,
    lastAttemptDate: null,
    retryAfterUntil: null,
    articles: [],
  };
}

function getRetryAfterUntil(response: Response) {
  const retryAfter = response.headers.get("Retry-After");

  if (!retryAfter) {
    return null;
  }

  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds)) {
    return Date.now() + retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(retryAfter);

  return Number.isFinite(retryAfterDate) ? retryAfterDate : null;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSourceArticleId(article: Record<string, unknown>) {
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

function getArticleUrl(
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

function estimateDurationSeconds(bodyLettersCount: number | null) {
  if (!bodyLettersCount || bodyLettersCount <= 0) {
    return DEFAULT_ESTIMATED_DURATION_SECONDS;
  }

  return Math.max(
    60,
    Math.ceil(bodyLettersCount / LETTERS_PER_MINUTE) * 60,
  );
}

function getTopicNames(topics: unknown) {
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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isArticle(value: unknown): value is Article {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.sourceArticleId === "string" &&
    typeof value.title === "string" &&
    value.sourceType === "zenn" &&
    typeof value.author === "string" &&
    typeof value.url === "string" &&
    typeof value.estimatedDurationSeconds === "number" &&
    Number.isFinite(value.estimatedDurationSeconds) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    (value.summary === undefined || typeof value.summary === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRawZennArticleContentInput(
  value: unknown,
  articleId: string,
): value is RawArticleContentInput {
  return (
    isRecord(value) &&
    value.articleId === articleId &&
    value.sourceType === "zenn" &&
    typeof value.sourceArticleId === "string" &&
    typeof value.url === "string" &&
    value.format === "html" &&
    typeof value.body === "string" &&
    typeof value.fetchedAt === "string"
  );
}
