import type {
  ArticleContentResult,
  ArticleContentSegment,
} from "../types/articleContent";
import type {
  CodeNarrationSegment,
  NarrationGenerationFailureReason,
  NarrationGenerationResult,
  NarrationScript,
  NarrationSegment,
  NarrationSegmentOrigin,
  NarrationTextChunk,
  ProseNarrationSegment,
} from "../types/narration";
import { transformCodeBlock } from "./codeBlocks/codeBlockTransformer";

const LETTERS_PER_MINUTE = 500;
const NARRATION_SCRIPT_VERSION = "narration-rules-v1";
const DEFAULT_CHUNK_CHARACTER_LIMIT = 1_600;

type BuildNarrationOptions = {
  maxChunkCharacters?: number;
};

export function generateNarrationScript(
  content: ArticleContentResult,
  options: BuildNarrationOptions = {},
): NarrationGenerationResult {
  const generatedAt = new Date().toISOString();

  if (content.status === "failed") {
    return buildFailure({
      articleId: content.articleId,
      generatedAt,
      reason: "article-content-failed",
      errorMessage: content.errorMessage,
    });
  }

  if (content.segments.length === 0) {
    return buildFailure({
      articleId: content.articleId,
      generatedAt,
      reason: "empty-content",
      errorMessage: "Article content does not contain narratable segments",
    });
  }

  const narrationSegments = buildNarrationSegments(
    content.articleId,
    content.segments,
  );

  if (narrationSegments.length === 0) {
    return buildFailure({
      articleId: content.articleId,
      generatedAt,
      reason: "empty-narration",
      errorMessage: "Narration script could not be generated from article content",
    });
  }

  const textChunks = buildNarrationTextChunks(
    narrationSegments,
    options.maxChunkCharacters ?? DEFAULT_CHUNK_CHARACTER_LIMIT,
  );
  const text = finalizeScriptText(textChunks.map((chunk) => chunk.text).join("\n\n"));

  if (!text) {
    return buildFailure({
      articleId: content.articleId,
      generatedAt,
      reason: "empty-narration",
      errorMessage: "Narration script was empty after cleanup",
    });
  }

  const script: NarrationScript = {
    articleId: content.articleId,
    text,
    segments: narrationSegments,
    textChunks,
    estimatedDurationSeconds: estimateDurationSeconds(text),
    generatedAt,
    version: NARRATION_SCRIPT_VERSION,
  };

  return {
    status: "success",
    script,
  };
}

export function buildNarrationSegments(
  articleId: string,
  segments: ArticleContentSegment[],
): NarrationSegment[] {
  const narrationSegments: NarrationSegment[] = [];
  let currentHeading: string | undefined;

  for (const segment of segments) {
    if (segment.kind === "heading") {
      const headingText = normalizeNarrationText(segment.text);
      currentHeading = headingText || undefined;
      const text = formatHeading(headingText);

      if (text) {
        narrationSegments.push(
          buildProseSegment({
            articleId,
            segment,
            order: narrationSegments.length + 1,
            text,
            origin: "heading",
          }),
        );
      }

      continue;
    }

    if (segment.kind === "codeBlock") {
      const codeBlock = transformCodeBlock({
        rawCode: segment.rawCode,
        language: segment.language,
        surroundingHeading: currentHeading,
      });
      const text = formatCodeNarration(codeBlock.narrationText);

      if (text) {
        narrationSegments.push({
          id: `narration:${segment.id}`,
          articleId,
          kind: "code",
          sourceKind: "codeBlock",
          sourceSegmentId: segment.id,
          order: narrationSegments.length + 1,
          text,
          origin: getCodeOrigin(codeBlock.kind),
          codeBlock,
        } satisfies CodeNarrationSegment);
      }

      continue;
    }

    const text = formatProseSegment(segment);

    if (!text) {
      continue;
    }

    narrationSegments.push(
      buildProseSegment({
        articleId,
        segment,
        order: narrationSegments.length + 1,
        text,
        origin: segment.kind,
      }),
    );
  }

  return narrationSegments;
}

export function buildNarrationTextChunks(
  segments: NarrationSegment[],
  maxChunkCharacters = DEFAULT_CHUNK_CHARACTER_LIMIT,
): NarrationTextChunk[] {
  const chunks: NarrationTextChunk[] = [];
  let currentTextParts: string[] = [];
  let currentSourceSegmentIds: string[] = [];

  const flushChunk = () => {
    const text = finalizeScriptText(currentTextParts.join("\n"));

    if (text) {
      chunks.push({
        id: `narration-chunk:${chunks.length + 1}`,
        order: chunks.length + 1,
        text,
        sourceSegmentIds: currentSourceSegmentIds,
      });
    }

    currentTextParts = [];
    currentSourceSegmentIds = [];
  };

  for (const segment of segments) {
    const units = splitTextForChunking(segment.text, maxChunkCharacters);

    for (const unit of units) {
      const normalizedUnit = finalizeScriptText(unit);

      if (!normalizedUnit) {
        continue;
      }

      const candidate = finalizeScriptText(
        [...currentTextParts, normalizedUnit].join("\n"),
      );

      if (candidate.length > maxChunkCharacters && currentTextParts.length > 0) {
        flushChunk();
      }

      currentTextParts.push(normalizedUnit);

      if (!currentSourceSegmentIds.includes(segment.sourceSegmentId)) {
        currentSourceSegmentIds.push(segment.sourceSegmentId);
      }
    }
  }

  flushChunk();

  return chunks;
}

function buildProseSegment({
  articleId,
  segment,
  order,
  text,
  origin,
}: {
  articleId: string;
  segment: Exclude<ArticleContentSegment, { kind: "codeBlock" }>;
  order: number;
  text: string;
  origin: NarrationSegmentOrigin;
}): ProseNarrationSegment {
  return {
    id: `narration:${segment.id}`,
    articleId,
    kind: "prose",
    sourceKind: segment.kind,
    sourceSegmentId: segment.id,
    order,
    text,
    origin,
  };
}

function formatHeading(text: string) {
  if (!text || isUiNoise(text)) {
    return "";
  }

  return ensureSentenceEnding(text);
}

function formatProseSegment(
  segment: Exclude<ArticleContentSegment, { kind: "codeBlock" }>,
) {
  const text = normalizeNarrationText(segment.text);

  if (!text || isUiNoise(text)) {
    return "";
  }

  switch (segment.kind) {
    case "paragraph":
      return ensureSentenceEnding(text);
    case "quote":
      return ensureSentenceEnding(`引用です。${text}`);
    case "listItem":
      return ensureSentenceEnding(text);
    case "heading":
      return formatHeading(text);
  }
}

function formatCodeNarration(text: string) {
  const normalizedText = normalizeNarrationText(text);

  if (!normalizedText || isUiNoise(normalizedText)) {
    return "";
  }

  return ensureSentenceEnding(normalizedText);
}

function normalizeNarrationText(text: string) {
  return decodeHtmlEntities(text)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/[^\s)]+/g, " ")
    .replace(/\[\^[^\]]+]/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^([-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function finalizeScriptText(text: string) {
  return text
    .split("\n")
    .map((line) => normalizeNarrationText(line))
    .filter((line) => line && !isUiNoise(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTextForChunking(text: string, maxChunkCharacters: number) {
  if (text.length <= maxChunkCharacters) {
    return [text];
  }

  const sentencePattern = /[^。！？.!?]+[。！？.!?]?/g;
  const sentences = text.match(sentencePattern)?.map((sentence) => sentence.trim());

  if (!sentences || sentences.length === 0) {
    return splitLongText(text, maxChunkCharacters);
  }

  const units: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }

    if (sentence.length > maxChunkCharacters) {
      if (current) {
        units.push(current);
        current = "";
      }

      units.push(...splitLongText(sentence, maxChunkCharacters));
      continue;
    }

    const candidate = current ? `${current}${sentence}` : sentence;

    if (candidate.length > maxChunkCharacters && current) {
      units.push(current);
      current = sentence;
      continue;
    }

    current = candidate;
  }

  if (current) {
    units.push(current);
  }

  return units;
}

function splitLongText(text: string, maxChunkCharacters: number) {
  const units: string[] = [];
  let index = 0;

  while (index < text.length) {
    units.push(text.slice(index, index + maxChunkCharacters));
    index += maxChunkCharacters;
  }

  return units;
}

function ensureSentenceEnding(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return "";
  }

  return /[。！？.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}。`;
}

function isUiNoise(text: string) {
  const normalizedText = text.trim().toLowerCase();

  return [
    "copy",
    "copied",
    "copied!",
    "コピー",
    "コピーしました",
    "目次",
    "table of contents",
  ].includes(normalizedText);
}

function estimateDurationSeconds(text: string) {
  return Math.max(30, Math.ceil(text.length / LETTERS_PER_MINUTE) * 60);
}

function buildFailure({
  articleId,
  generatedAt,
  reason,
  errorMessage,
}: {
  articleId: string;
  generatedAt: string;
  reason: NarrationGenerationFailureReason;
  errorMessage: string;
}): NarrationGenerationResult {
  return {
    status: "failed",
    articleId,
    reason,
    errorMessage,
    generatedAt,
  };
}

function getCodeOrigin(
  kind: "summary" | "explanation" | "skip",
): NarrationSegmentOrigin {
  switch (kind) {
    case "summary":
      return "codeSummary";
    case "explanation":
      return "codeExplanation";
    case "skip":
      return "codeSkipped";
  }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
