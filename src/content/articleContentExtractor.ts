import type {
  ArticleContentResult,
  ArticleContentSegment,
  RawArticleContentInput,
} from "../types/articleContent";

const LETTERS_PER_MINUTE = 500;

type TextSegmentKind = "paragraph" | "quote" | "listItem";

export function extractArticleContent(
  rawContent: RawArticleContentInput,
): ArticleContentResult {
  const extractedAt = new Date().toISOString();
  const sourceText = rawContent.body.trim();

  if (!sourceText) {
    return buildFailure(rawContent, extractedAt, "Article body is empty");
  }

  const markdownLikeText =
    rawContent.format === "html" ? htmlToMarkdownLikeText(sourceText) : sourceText;
  const normalizedText = stripFrontMatter(markdownLikeText);
  const segments = parseMarkdownLikeText(normalizedText);
  const plainTextFallback = buildPlainTextFallback(normalizedText);

  if (segments.length > 0) {
    return {
      status: "success",
      articleId: rawContent.articleId,
      sourceType: rawContent.sourceType,
      sourceArticleId: rawContent.sourceArticleId,
      url: rawContent.url,
      segments,
      plainTextFallback,
      estimatedDurationSeconds: estimateDurationSeconds(segments),
      extractedAt,
    };
  }

  if (plainTextFallback) {
    return {
      status: "fallback",
      articleId: rawContent.articleId,
      sourceType: rawContent.sourceType,
      sourceArticleId: rawContent.sourceArticleId,
      url: rawContent.url,
      segments: [
        {
          id: "paragraph:1",
          kind: "paragraph",
          order: 1,
          text: plainTextFallback,
        },
      ],
      plainTextFallback,
      estimatedDurationSeconds: estimateDurationSecondsFromText(plainTextFallback),
      extractedAt,
      errorMessage: "Structured content could not be extracted",
    };
  }

  return buildFailure(
    rawContent,
    extractedAt,
    "Article body did not contain narratable text",
  );
}

export function parseMarkdownLikeText(
  content: string,
): ArticleContentSegment[] {
  const lines = normalizeNewlines(content).split("\n");
  const segments: ArticleContentSegment[] = [];
  let paragraphLines: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    const text = cleanNarrationText(paragraphLines.join(" "));
    paragraphLines = [];

    if (text) {
      segments.push(buildTextSegment("paragraph", segments.length + 1, text));
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      index += 1;
      continue;
    }

    const codeFence = getCodeFence(trimmedLine);

    if (codeFence) {
      const codeBlock = readClosedCodeBlock(lines, index, codeFence.marker);

      if (codeBlock) {
        flushParagraph();
        segments.push({
          id: `codeBlock:${segments.length + 1}`,
          kind: "codeBlock",
          order: segments.length + 1,
          text: "",
          rawCode: codeBlock.rawCode,
          ...(codeFence.language ? { language: codeFence.language } : {}),
        });
        index = codeBlock.nextIndex;
        continue;
      }

      index += 1;
      continue;
    }

    const heading = trimmedLine.match(/^(#{1,6})\s+(.+)$/);

    if (heading) {
      flushParagraph();
      const text = cleanNarrationText(heading[2] ?? "");

      if (text) {
        segments.push({
          id: `heading:${segments.length + 1}`,
          kind: "heading",
          level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
          order: segments.length + 1,
          text,
        });
      }

      index += 1;
      continue;
    }

    const quote = trimmedLine.match(/^>\s?(.*)$/);

    if (quote) {
      flushParagraph();
      const quoteLines = [quote[1] ?? ""];
      index += 1;

      while (index < lines.length) {
        const nextQuote = (lines[index] ?? "").trim().match(/^>\s?(.*)$/);

        if (!nextQuote) {
          break;
        }

        quoteLines.push(nextQuote[1] ?? "");
        index += 1;
      }

      const text = cleanNarrationText(quoteLines.join(" "));

      if (text) {
        segments.push(buildTextSegment("quote", segments.length + 1, text));
      }

      continue;
    }

    const listItem = trimmedLine.match(/^([-*+]|\d+[.)])\s+(.+)$/);

    if (listItem) {
      flushParagraph();
      const text = cleanNarrationText(listItem[2] ?? "");

      if (text) {
        segments.push(buildTextSegment("listItem", segments.length + 1, text));
      }

      index += 1;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();

  return segments;
}

export function cleanNarrationText(text: string) {
  return decodeHtmlEntities(text)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/[^\s)]+/g, " ")
    .replace(/\[\^[^\]]+]/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^([-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTextSegment(
  kind: TextSegmentKind,
  order: number,
  text: string,
): ArticleContentSegment {
  return {
    id: `${kind}:${order}`,
    kind,
    order,
    text,
  };
}

function getCodeFence(line: string) {
  const match = line.match(/^(`{3,}|~{3,})\s*([A-Za-z0-9_+.#-]+)?\s*$/);

  if (!match) {
    return null;
  }

  return {
    marker: (match[1].startsWith("`") ? "`" : "~") as "`" | "~",
    language: match[2]?.trim(),
  };
}

function readClosedCodeBlock(
  lines: string[],
  startIndex: number,
  marker: "`" | "~",
) {
  const closeFence = marker.repeat(3);
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().startsWith(closeFence)) {
      return {
        rawCode: codeLines.join("\n").trim(),
        nextIndex: index + 1,
      };
    }

    codeLines.push(line);
    index += 1;
  }

  return null;
}

function htmlToMarkdownLikeText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(
      /<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi,
      (_match, codeAttributes: string, rawCode: string) => {
        const language = getLanguageFromCodeAttributes(codeAttributes);
        return `\n\`\`\`${language ?? ""}\n${decodeHtmlEntities(
          rawCode.replace(/<[^>]+>/g, ""),
        )}\n\`\`\`\n`;
      },
    )
    .replace(/<\/(h[1-6]|p|blockquote|li|ul|ol|pre|div|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>/gi, (_match, level: string) =>
      "\n" + "#".repeat(Number(level)) + " ",
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<blockquote\b[^>]*>/gi, "\n> ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function getLanguageFromCodeAttributes(attributes: string) {
  const className = attributes.match(/class=["'][^"']*language-([^"'\s]+)[^"']*["']/i);
  return className?.[1];
}

function buildPlainTextFallback(content: string) {
  const withoutCodeBlocks = normalizeNewlines(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ");
  const text = cleanNarrationText(withoutCodeBlocks);

  return text || undefined;
}

function estimateDurationSeconds(segments: ArticleContentSegment[]) {
  const narratableText = segments
    .filter((segment) => segment.kind !== "codeBlock")
    .map((segment) => segment.text)
    .join(" ");

  return estimateDurationSecondsFromText(narratableText);
}

function estimateDurationSecondsFromText(text: string) {
  if (!text.trim()) {
    return 60;
  }

  return Math.max(60, Math.ceil(text.length / LETTERS_PER_MINUTE) * 60);
}

function stripFrontMatter(content: string) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

function normalizeNewlines(text: string) {
  return text.replace(/\r\n?/g, "\n");
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

function buildFailure(
  rawContent: RawArticleContentInput,
  extractedAt: string,
  errorMessage: string,
): ArticleContentResult {
  return {
    status: "failed",
    articleId: rawContent.articleId,
    sourceType: rawContent.sourceType,
    sourceArticleId: rawContent.sourceArticleId,
    url: rawContent.url,
    segments: [],
    estimatedDurationSeconds: null,
    extractedAt,
    errorMessage,
  };
}
