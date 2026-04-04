export type SourceType = "Zenn" | "Qiita";

export type Article = {
  id: string;
  title: string;
  sourceType: SourceType;
  author: string;
  durationMinutes: number;
  tags: string[];
  summary: string;
};
