import type { Article } from "../types/article";

const ARTICLE_FROM_URL_ENDPOINT = "/api/article-from-url";

type ApiErrorPayload = {
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
};

export async function fetchArticleFromUrl(articleUrl: string): Promise<Article> {
  const requestUrl = new URL(ARTICLE_FROM_URL_ENDPOINT, window.location.origin);
  requestUrl.searchParams.set("url", articleUrl);

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await getArticleFromUrlErrorMessage(response));
  }

  const payload: unknown = await response.json();

  if (!isArticle(payload)) {
    throw new Error("Article URL response shape is not supported");
  }

  return payload;
}

function isArticle(value: unknown): value is Article {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.sourceArticleId === "string" &&
    typeof value.title === "string" &&
    (value.sourceType === "zenn" || value.sourceType === "qiita") &&
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

async function getArticleFromUrlErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const code = typeof payload.code === "string" ? payload.code : null;
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    const retryAfterSeconds =
      typeof payload.retryAfterSeconds === "number" &&
      Number.isFinite(payload.retryAfterSeconds)
        ? payload.retryAfterSeconds
        : null;

    if (code === "bad_request") {
      return "URLの形式を確認してください。";
    }

    if (code === "unsupported_article_url") {
      return "ZennまたはQiitaの記事URLを入力してください。";
    }

    if (retryAfterSeconds !== null) {
      return `記事URLの取得が制限されています。${Math.ceil(retryAfterSeconds)}秒後に再試行してください。`;
    }

    return message || `記事URLを追加できませんでした: ${response.status}`;
  } catch {
    return `記事URLを追加できませんでした: ${response.status}`;
  }
}
