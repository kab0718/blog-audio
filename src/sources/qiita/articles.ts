import { getApiErrorMessage } from "../../api/apiError";
import type { Article } from "../../types/article";
import type { RawArticleContentInput } from "../../types/articleContent";

const QIITA_ITEMS_URL = "/api/articles?source=qiita";
const QIITA_ITEM_URL = "/api/article-content";

export async function fetchQiitaArticles(): Promise<Article[]> {
  const response = await fetch(QIITA_ITEMS_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, "Qiita articles request failed"),
    );
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("Qiita articles response shape is not supported");
  }

  return payload.filter(isArticle);
}

export async function fetchQiitaArticleContent(
  article: Article,
): Promise<RawArticleContentInput> {
  if (article.sourceType !== "qiita") {
    throw new Error("Qiita content fetcher received a non-Qiita article");
  }

  const requestUrl = new URL(QIITA_ITEM_URL, window.location.origin);
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
    throw new Error(
      await getApiErrorMessage(response, "Qiita article content request failed"),
    );
  }

  const payload: unknown = await response.json();

  if (!isRawQiitaArticleContentInput(payload, article.id)) {
    throw new Error("Qiita article content response shape is not supported");
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArticle(value: unknown): value is Article {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.sourceArticleId === "string" &&
    typeof value.title === "string" &&
    value.sourceType === "qiita" &&
    typeof value.author === "string" &&
    typeof value.url === "string" &&
    typeof value.estimatedDurationSeconds === "number" &&
    Number.isFinite(value.estimatedDurationSeconds) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    (value.summary === undefined || typeof value.summary === "string")
  );
}

function isRawQiitaArticleContentInput(
  value: unknown,
  articleId: string,
): value is RawArticleContentInput {
  return (
    isRecord(value) &&
    value.articleId === articleId &&
    value.sourceType === "qiita" &&
    typeof value.sourceArticleId === "string" &&
    typeof value.url === "string" &&
    (value.format === "markdown" || value.format === "html") &&
    typeof value.body === "string" &&
    typeof value.fetchedAt === "string"
  );
}
