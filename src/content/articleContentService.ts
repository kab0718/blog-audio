import type { Article } from "../types/article";
import type {
  ArticleContentResult,
  RawArticleContentInput,
} from "../types/articleContent";
import { fetchQiitaArticleContent } from "../sources/qiita/articles";
import { fetchZennArticleContent } from "../sources/zenn/articles";
import { extractArticleContent } from "./articleContentExtractor";

export async function loadArticleContent(
  article: Article,
): Promise<ArticleContentResult> {
  try {
    const rawContent = await fetchArticleContentInput(article);
    return extractArticleContent(rawContent);
  } catch (error) {
    return buildArticleContentFailure(
      article,
      error instanceof Error
        ? error.message
        : "Article content could not be loaded",
    );
  }
}

export function fetchArticleContentInput(
  article: Article,
): Promise<RawArticleContentInput> {
  switch (article.sourceType) {
    case "zenn":
      return fetchZennArticleContent(article);
    case "qiita":
      return fetchQiitaArticleContent(article);
    default:
      return assertNever(article.sourceType);
  }
}

function buildArticleContentFailure(
  article: Article,
  errorMessage: string,
): ArticleContentResult {
  return {
    status: "failed",
    articleId: article.id,
    sourceType: article.sourceType,
    sourceArticleId: article.sourceArticleId,
    url: article.url,
    segments: [],
    estimatedDurationSeconds: null,
    extractedAt: new Date().toISOString(),
    errorMessage,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported article source: ${String(value)}`);
}
