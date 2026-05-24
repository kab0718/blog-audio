import type {
  CodeBlockDebugMetadata,
  CodeBlockTransformInput,
  CodeBlockTransformKind,
  CodeBlockTransformReason,
  CodeBlockTransformResult,
} from "../../types/narration";

const LONG_CODE_LINE_THRESHOLD = 80;
const LONG_CODE_CHARACTER_THRESHOLD = 1_500;
const MEDIUM_CODE_LINE_THRESHOLD = 25;
const MEDIUM_CODE_CHARACTER_THRESHOLD = 600;

export function transformCodeBlock(
  input: CodeBlockTransformInput,
): CodeBlockTransformResult {
  try {
    return transformCodeBlockSafely(input);
  } catch {
    return buildResult({
      input,
      kind: "skip",
      narrationText: "",
      reason: "transform-error",
      detectedSignals: ["exception"],
    });
  }
}

function transformCodeBlockSafely(
  input: CodeBlockTransformInput,
): CodeBlockTransformResult {
  const code = normalizeCode(input.rawCode);
  const metrics = getCodeMetrics(code);
  const sourceLanguage = normalizeLanguage(input.language);
  const languageLabel = getLanguageLabel(sourceLanguage);
  const signals = detectSignals(code, sourceLanguage);

  if (!code) {
    return buildResult({
      input,
      kind: "skip",
      narrationText: "",
      reason: "empty-code-block",
      detectedSignals: ["empty"],
    });
  }

  if (signals.includes("stack-trace")) {
    return buildResult({
      input,
      kind: "skip",
      narrationText: "エラーログを省略します。",
      reason: "stack-trace-skipped",
      detectedSignals: signals,
    });
  }

  if (signals.includes("log-output")) {
    if (metrics.lineCount > 5 || metrics.characterCount > 400) {
      return buildResult({
        input,
        kind: "skip",
        narrationText: "ログ出力を省略します。",
        reason: "log-output-skipped",
        detectedSignals: signals,
      });
    }

    return buildResult({
      input,
      kind: "explanation",
      narrationText: "ログ出力の例を示しています。",
      reason: "log-output-explained",
      detectedSignals: signals,
    });
  }

  if (
    metrics.lineCount >= LONG_CODE_LINE_THRESHOLD ||
    metrics.characterCount >= LONG_CODE_CHARACTER_THRESHOLD
  ) {
    return buildResult({
      input,
      kind: "skip",
      narrationText: "長いコード例を省略します。",
      reason: "long-code-skipped",
      detectedSignals: [...signals, "long-code"],
    });
  }

  if (signals.includes("config")) {
    return buildResult({
      input,
      kind: "explanation",
      narrationText: `${languageLabel}の設定例を示しています。`,
      reason: "recognized-config-snippet",
      detectedSignals: signals,
    });
  }

  if (signals.includes("command")) {
    return buildResult({
      input,
      kind: "explanation",
      narrationText: "コマンド実行例を示しています。",
      reason: "recognized-command-snippet",
      detectedSignals: signals,
    });
  }

  if (
    metrics.lineCount >= MEDIUM_CODE_LINE_THRESHOLD ||
    metrics.characterCount >= MEDIUM_CODE_CHARACTER_THRESHOLD
  ) {
    return buildResult({
      input,
      kind: "explanation",
      narrationText: `${languageLabel}の長めのコード例です。詳細な実装は省略します。`,
      reason: "long-code-explained",
      detectedSignals: [...signals, "medium-code"],
    });
  }

  if (signals.includes("ui-component")) {
    return buildResult({
      input,
      kind: "summary",
      narrationText: `${languageLabel}のコード例で、UI コンポーネントの定義を示しています。`,
      reason: "recognized-ui-component-example",
      detectedSignals: signals,
    });
  }

  if (signals.includes("implementation")) {
    return buildResult({
      input,
      kind: "summary",
      narrationText: `${languageLabel}のコード例で、関数や処理の定義を示しています。`,
      reason: "recognized-implementation-example",
      detectedSignals: signals,
    });
  }

  if (signals.includes("query-or-schema")) {
    return buildResult({
      input,
      kind: "summary",
      narrationText: `${languageLabel}の例で、データ取得や構造定義を示しています。`,
      reason: "recognized-query-or-schema",
      detectedSignals: signals,
    });
  }

  return buildResult({
    input,
    kind: "explanation",
    narrationText: `${languageLabel}のコード例を示しています。`,
    reason: "generic-code-explained",
    detectedSignals: signals.length > 0 ? signals : ["generic-code"],
  });
}

function buildResult({
  input,
  kind,
  narrationText,
  reason,
  detectedSignals,
}: {
  input: CodeBlockTransformInput;
  kind: CodeBlockTransformKind;
  narrationText: string;
  reason: CodeBlockTransformReason;
  detectedSignals: string[];
}): CodeBlockTransformResult {
  const normalizedCode = normalizeCode(input.rawCode);
  const metrics = getCodeMetrics(normalizedCode);
  const sourceLanguage = normalizeLanguage(input.language);
  const metadata: CodeBlockDebugMetadata = {
    transformVersion: "code-block-rules-v1",
    reason,
    originalLineCount: metrics.lineCount,
    originalCharacterCount: metrics.characterCount,
    originalCodeIncluded: false,
    detectedSignals,
    codeFingerprint: createCodeFingerprint(normalizedCode),
    ...(input.surroundingHeading
      ? { surroundingHeading: input.surroundingHeading }
      : {}),
    ...(sourceLanguage ? { sourceLanguage } : {}),
  };

  return {
    kind,
    narrationText,
    reason,
    originalLineCount: metrics.lineCount,
    metadata,
    ...(sourceLanguage ? { sourceLanguage } : {}),
  } as CodeBlockTransformResult;
}

function detectSignals(code: string, sourceLanguage?: string) {
  const lowerCode = code.toLowerCase();
  const signals = new Set<string>();

  if (isStackTraceLike(code)) {
    signals.add("stack-trace");
  }

  if (isLogLike(code)) {
    signals.add("log-output");
  }

  if (isConfigLike(code, sourceLanguage)) {
    signals.add("config");
  }

  if (isCommandLike(code, sourceLanguage)) {
    signals.add("command");
  }

  if (isUiComponentLike(code, sourceLanguage)) {
    signals.add("ui-component");
  }

  if (isImplementationLike(code, sourceLanguage)) {
    signals.add("implementation");
  }

  if (
    /\b(select|insert into|update|delete from|create table)\b/i.test(code) ||
    lowerCode.includes("schema") ||
    lowerCode.includes("interface ") ||
    lowerCode.includes("type ")
  ) {
    signals.add("query-or-schema");
  }

  return Array.from(signals);
}

function isStackTraceLike(code: string) {
  return (
    /\bat\s+\S+\s+\([^)]*:\d+:\d+\)/.test(code) ||
    /Traceback \(most recent call last\):/.test(code) ||
    /^\s*File ".*", line \d+/m.test(code)
  );
}

function isLogLike(code: string) {
  const lines = code.split("\n").filter(Boolean);
  const logLineCount = lines.filter((line) =>
    /(\b(error|warn|warning|info|debug|trace|fatal)\b|\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}:\d{2})/i.test(
      line,
    ),
  ).length;

  return lines.length > 0 && logLineCount / lines.length >= 0.5;
}

function isConfigLike(code: string, sourceLanguage?: string) {
  const configLanguages = new Set([
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "env",
    "dockerfile",
  ]);

  if (sourceLanguage && configLanguages.has(sourceLanguage)) {
    return true;
  }

  return (
    /^\s*[{[]/.test(code) ||
    /^\s*[A-Z0-9_]+\s*=.+$/m.test(code) ||
    /^\s*[\w.-]+:\s+.+$/m.test(code)
  );
}

function isCommandLike(code: string, sourceLanguage?: string) {
  if (sourceLanguage && ["sh", "shell", "bash", "zsh"].includes(sourceLanguage)) {
    return true;
  }

  return /^\s*(npm|pnpm|yarn|bun|deno|git|curl|docker|kubectl)\s+\S+/m.test(
    code,
  );
}

function isUiComponentLike(code: string, sourceLanguage?: string) {
  const isJsLike =
    sourceLanguage &&
    ["js", "jsx", "ts", "tsx", "javascript", "typescript"].includes(
      sourceLanguage,
    );

  return Boolean(
    isJsLike &&
      (/<[A-Z][A-Za-z0-9]*/.test(code) ||
        /function\s+[A-Z][A-Za-z0-9]*\s*\(/.test(code) ||
        /const\s+[A-Z][A-Za-z0-9]*\s*=/.test(code)),
  );
}

function isImplementationLike(code: string, sourceLanguage?: string) {
  const implementationLanguage =
    sourceLanguage &&
    !["json", "yaml", "yml", "toml", "ini", "env"].includes(sourceLanguage);

  return Boolean(
    implementationLanguage &&
      (/\b(function|class|return|async|await|const|let|var|def|public|private)\b/.test(
        code,
      ) ||
        /=>/.test(code)),
  );
}

function getCodeMetrics(code: string) {
  if (!code) {
    return {
      lineCount: 0,
      characterCount: 0,
    };
  }

  return {
    lineCount: code.split("\n").length,
    characterCount: code.length,
  };
}

function normalizeCode(code: string) {
  return code.replace(/\r\n?/g, "\n").trim();
}

function normalizeLanguage(language?: string) {
  return language?.trim().toLowerCase() || undefined;
}

function getLanguageLabel(language?: string) {
  if (!language) {
    return "コード";
  }

  const labels: Record<string, string> = {
    js: "JavaScript",
    jsx: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    javascript: "JavaScript",
    typescript: "TypeScript",
    py: "Python",
    python: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    sh: "シェル",
    shell: "シェル",
    bash: "シェル",
    zsh: "シェル",
    sql: "SQL",
    dockerfile: "Dockerfile",
  };

  return labels[language] ?? language;
}

function createCodeFingerprint(code: string) {
  let hash = 0;

  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}
