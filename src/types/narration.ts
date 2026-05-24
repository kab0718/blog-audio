import type { ArticleContentSegment } from "./articleContent";

export type CodeBlockTransformKind = "summary" | "explanation" | "skip";

export type CodeBlockTransformReason =
  | "empty-code-block"
  | "recognized-implementation-example"
  | "recognized-ui-component-example"
  | "recognized-config-snippet"
  | "recognized-command-snippet"
  | "recognized-query-or-schema"
  | "log-output-explained"
  | "log-output-skipped"
  | "stack-trace-skipped"
  | "long-code-explained"
  | "long-code-skipped"
  | "generic-code-explained"
  | "transform-error";

export type CodeBlockDebugMetadata = {
  transformVersion: "code-block-rules-v1";
  reason: CodeBlockTransformReason;
  originalLineCount: number;
  originalCharacterCount: number;
  originalCodeIncluded: false;
  detectedSignals: string[];
  codeFingerprint: string;
  surroundingHeading?: string;
  sourceLanguage?: string;
};

type CodeBlockTransformResultBase = {
  kind: CodeBlockTransformKind;
  narrationText: string;
  reason: CodeBlockTransformReason;
  originalLineCount: number;
  metadata: CodeBlockDebugMetadata;
  sourceLanguage?: string;
};

export type CodeBlockSummaryResult = CodeBlockTransformResultBase & {
  kind: "summary";
  narrationText: string;
};

export type CodeBlockExplanationResult = CodeBlockTransformResultBase & {
  kind: "explanation";
  narrationText: string;
};

export type CodeBlockSkipResult = CodeBlockTransformResultBase & {
  kind: "skip";
  narrationText: string;
};

export type CodeBlockTransformResult =
  | CodeBlockSummaryResult
  | CodeBlockExplanationResult
  | CodeBlockSkipResult;

export type CodeBlockTransformInput = {
  rawCode: string;
  language?: string;
  surroundingHeading?: string;
};

export type NarrationSegmentOrigin =
  | "heading"
  | "paragraph"
  | "quote"
  | "listItem"
  | "codeSummary"
  | "codeExplanation"
  | "codeSkipped";

type NarrationSegmentBase = {
  id: string;
  articleId: string;
  order: number;
  sourceSegmentId: ArticleContentSegment["id"];
  text: string;
  origin: NarrationSegmentOrigin;
};

export type ProseNarrationSegment = NarrationSegmentBase & {
  kind: "prose";
  sourceKind: Exclude<ArticleContentSegment["kind"], "codeBlock">;
};

export type CodeNarrationSegment = NarrationSegmentBase & {
  kind: "code";
  sourceKind: "codeBlock";
  codeBlock: CodeBlockTransformResult;
};

export type NarrationSegment = ProseNarrationSegment | CodeNarrationSegment;

export type NarrationTextChunk = {
  id: string;
  order: number;
  text: string;
  sourceSegmentIds: ArticleContentSegment["id"][];
};

export type NarrationScriptVersion = "narration-rules-v1";

export type NarrationScript = {
  articleId: string;
  text: string;
  segments: NarrationSegment[];
  textChunks: NarrationTextChunk[];
  estimatedDurationSeconds: number;
  generatedAt: string;
  version: NarrationScriptVersion;
};

export type NarrationGenerationFailureReason =
  | "article-content-failed"
  | "empty-content"
  | "empty-narration";

export type NarrationGenerationSuccess = {
  status: "success";
  script: NarrationScript;
};

export type NarrationGenerationFailure = {
  status: "failed";
  articleId: string;
  reason: NarrationGenerationFailureReason;
  errorMessage: string;
  generatedAt: string;
};

export type NarrationGenerationResult =
  | NarrationGenerationSuccess
  | NarrationGenerationFailure;
