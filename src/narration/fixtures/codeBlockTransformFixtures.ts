import type { CodeBlockTransformInput } from "../../types/narration";
import { transformCodeBlock } from "../codeBlocks/codeBlockTransformer";

export type CodeBlockTransformFixture = {
  id: string;
  description: string;
  input: CodeBlockTransformInput;
};

export const codeBlockTransformFixtures: CodeBlockTransformFixture[] = [
  {
    id: "short-typescript-function",
    description: "短い実装コードは逐語読みせず summary にする",
    input: {
      language: "ts",
      rawCode: [
        "export function formatTitle(title: string) {",
        "  return title.trim().replace(/\\s+/g, \" \");",
        "}",
      ].join("\n"),
      surroundingHeading: "タイトル整形",
    },
  },
  {
    id: "long-typescript-implementation",
    description: "長いコードは詳細を読まず explanation または skip に倒す",
    input: {
      language: "ts",
      rawCode: Array.from(
        { length: 32 },
        (_, index) => `const item${index} = buildQueueItem(source[${index}]);`,
      ).join("\n"),
      surroundingHeading: "キュー構築",
    },
  },
  {
    id: "json-config",
    description: "設定断片は設定例として explanation にする",
    input: {
      language: "json",
      rawCode: [
        "{",
        "  \"scripts\": {",
        "    \"build\": \"tsc -b && vite build\"",
        "  }",
        "}",
      ].join("\n"),
      surroundingHeading: "ビルド設定",
    },
  },
  {
    id: "log-output",
    description: "ログ風テキストはログ出力として説明または skip にする",
    input: {
      rawCode: [
        "2026-05-24 10:00:01 INFO queue started",
        "2026-05-24 10:00:02 WARN retrying fetch",
        "2026-05-24 10:00:03 ERROR request failed",
        "2026-05-24 10:00:04 INFO fallback selected",
        "2026-05-24 10:00:05 INFO queue continued",
        "2026-05-24 10:00:06 INFO complete",
      ].join("\n"),
      surroundingHeading: "実行ログ",
    },
  },
];

export const codeBlockTransformFixtureResults = codeBlockTransformFixtures.map(
  (fixture) => ({
    id: fixture.id,
    result: transformCodeBlock(fixture.input),
  }),
);
