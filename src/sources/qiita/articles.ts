import type { Article } from "../../types/article";

const QIITA_ITEMS_URL = "/api/qiita/items?page=1&per_page=8";
const QIITA_BASE_URL = "https://qiita.com";
const DEFAULT_ESTIMATED_DURATION_SECONDS = 5 * 60;
const LETTERS_PER_MINUTE = 500;
const SUMMARY_MAX_LENGTH = 120;

export type QiitaItemResponse = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  body?: unknown;
  user?: {
    id?: unknown;
    name?: unknown;
  };
  tags?: unknown;
};

export async function fetchQiitaArticles(): Promise<Article[]> {
  const response = await fetch(QIITA_ITEMS_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Qiita articles request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("Qiita articles response shape is not supported");
  }

  return payload
    .map((item) => toArticleFromQiita(item))
    .filter((article): article is Article => article !== null);
}

export function toArticleFromQiita(rawItem: unknown): Article | null {
  if (!isRecord(rawItem)) {
    return null;
  }

  const sourceArticleId = toNonEmptyString(rawItem.id);
  const title = toNonEmptyString(rawItem.title);
  const user = isRecord(rawItem.user) ? rawItem.user : null;
  const userId = user ? toNonEmptyString(user.id) : null;
  const author = (user ? toNonEmptyString(user.name) : null) ?? userId;
  const url = getArticleUrl(rawItem, userId, sourceArticleId);
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
    estimatedDurationSeconds: estimateDurationSeconds(body),
    tags: getTagNames(rawItem.tags),
    summary: buildSummary(body) ?? undefined,
  };
}

function getArticleUrl(
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

function estimateDurationSeconds(body: string | null) {
  if (!body) {
    return DEFAULT_ESTIMATED_DURATION_SECONDS;
  }

  return Math.max(60, Math.ceil(body.length / LETTERS_PER_MINUTE) * 60);
}

function getTagNames(tags: unknown) {
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

function buildSummary(body: string | null) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
