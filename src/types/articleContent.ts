import type { SourceType } from "./article";

export type ArticleContentFormat = "markdown" | "html" | "text";

export type RawArticleContentInput = {
  articleId: string;
  sourceType: SourceType;
  sourceArticleId: string;
  url: string;
  format: ArticleContentFormat;
  body: string;
  fetchedAt: string;
};

type ArticleContentSegmentBase = {
  id: string;
  order: number;
};

export type ArticleHeadingSegment = ArticleContentSegmentBase & {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
};

export type ArticleParagraphSegment = ArticleContentSegmentBase & {
  kind: "paragraph";
  text: string;
};

export type ArticleQuoteSegment = ArticleContentSegmentBase & {
  kind: "quote";
  text: string;
};

export type ArticleListItemSegment = ArticleContentSegmentBase & {
  kind: "listItem";
  text: string;
};

export type ArticleCodeBlockSegment = ArticleContentSegmentBase & {
  kind: "codeBlock";
  text: "";
  rawCode: string;
  language?: string;
};

export type ArticleContentSegment =
  | ArticleHeadingSegment
  | ArticleParagraphSegment
  | ArticleQuoteSegment
  | ArticleListItemSegment
  | ArticleCodeBlockSegment;

export type ArticleContentStatus = "success" | "fallback" | "failed";

export type ArticleContent = {
  status: Exclude<ArticleContentStatus, "failed">;
  articleId: string;
  sourceType: SourceType;
  sourceArticleId: string;
  url: string;
  segments: ArticleContentSegment[];
  plainTextFallback?: string;
  estimatedDurationSeconds: number;
  extractedAt: string;
  errorMessage?: string;
};

export type ArticleContentFailure = {
  status: "failed";
  articleId: string;
  sourceType: SourceType;
  sourceArticleId: string;
  url: string;
  segments: [];
  plainTextFallback?: string;
  estimatedDurationSeconds: null;
  extractedAt: string;
  errorMessage: string;
};

export type ArticleContentResult = ArticleContent | ArticleContentFailure;
