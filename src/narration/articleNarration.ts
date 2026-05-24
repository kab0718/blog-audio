import type { ArticleContentSegment } from "../types/articleContent";
import type {
  CodeNarrationSegment,
  NarrationSegment,
  NarrationSegmentOrigin,
  ProseNarrationSegment,
} from "../types/narration";
import { transformCodeBlock } from "./codeBlocks/codeBlockTransformer";

export function buildNarrationSegments(
  segments: ArticleContentSegment[],
): NarrationSegment[] {
  const narrationSegments: NarrationSegment[] = [];
  let currentHeading: string | undefined;

  for (const segment of segments) {
    if (segment.kind === "heading") {
      currentHeading = segment.text;
    }

    if (segment.kind === "codeBlock") {
      const codeBlock = transformCodeBlock({
        rawCode: segment.rawCode,
        language: segment.language,
        surroundingHeading: currentHeading,
      });

      narrationSegments.push({
        id: `narration:${segment.id}`,
        kind: "code",
        sourceKind: "codeBlock",
        sourceSegmentId: segment.id,
        order: narrationSegments.length + 1,
        text: codeBlock.narrationText,
        origin: getCodeOrigin(codeBlock.kind),
        codeBlock,
      } satisfies CodeNarrationSegment);

      continue;
    }

    narrationSegments.push({
      id: `narration:${segment.id}`,
      kind: "prose",
      sourceKind: segment.kind,
      sourceSegmentId: segment.id,
      order: narrationSegments.length + 1,
      text: segment.text,
      origin: segment.kind,
    } satisfies ProseNarrationSegment);
  }

  return narrationSegments;
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
