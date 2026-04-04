export type SourceType = "zenn" | "qiita";

export type Article = {
  id: string;
  sourceArticleId: string;
  title: string;
  sourceType: SourceType;
  author: string;
  url: string;
  estimatedDurationSeconds: number;
  tags: string[];
  summary: string;
};
