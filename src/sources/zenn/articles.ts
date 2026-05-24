import type { Article } from "../../types/article";

const ZENN_BASE_URL = "https://zenn.dev";
const ZENN_LATEST_ARTICLES_URL = "/api/zenn/articles?order=latest";
const DEFAULT_ESTIMATED_DURATION_SECONDS = 5 * 60;
const LETTERS_PER_MINUTE = 500;

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

export async function fetchZennLatestArticles(): Promise<Article[]> {
  const response = await fetch(ZENN_LATEST_ARTICLES_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Zenn articles request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isRecord(payload) || !Array.isArray(payload.articles)) {
    throw new Error("Zenn articles response shape is not supported");
  }

  return payload.articles
    .map((article) => toArticleFromZenn(article))
    .filter((article): article is Article => article !== null);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
