# Codex 開発ベストプラクティス調査メモ

## 1. 位置づけ

このドキュメントは、2026-03-29（JST）時点で OpenAI の公式ドキュメントを調べて整理した、**現在の Codex 開発運用のベストプラクティス**の要約である。  
`blog-audio` プロジェクトで Codex を使って設計・実装を進める際の作業ルールのたたき台として扱う。

## 2. 結論

現在のベストプラクティスは、Codex を単発のチャット相手として扱うのではなく、**設定可能な開発チームメンバーとして運用すること**に寄っている。

特に重要なのは次の7点。

1. 恒常的な指示は毎回のプロンプトではなく `AGENTS.md` に置く
2. ビルド / テスト / lint / 完了条件を Codex から見える形にする
3. モデルや権限は `config.toml` と CLI オプションで再現可能に管理する
4. 権限は最初から広げすぎず、`workspace-write` や `read-only` を基本にする
5. 1タスク1スレッドを守り、分岐時だけ fork する
6. 繰り返し作業は prompt のコピペ運用ではなく skill 化し、安定後に automation 化する
7. 外部ツールや MCP は最小構成から導入し、本当に手作業を減らすものだけ増やす

## 3. 重要ポイント

### 3.1 長期ルールは `AGENTS.md` に集約する

OpenAI 公式では、Codex がうまく動く前提として `AGENTS.md` の活用をかなり強く推奨している。  
役割としては「エージェント向けの README」に近い。

`AGENTS.md` に入れるべきもの:

- リポジトリ構成
- 起動方法
- build / test / lint コマンド
- コーディング規約
- 禁止事項
- 完了条件
- レビュー観点

重要なのは、曖昧な精神論を書くことではなく、**短く・具体的に・検証可能に書くこと**。  
同じ失敗が2回起きたら、次のプロンプトで口頭修正するのではなく `AGENTS.md` を更新する、という運用が推奨されている。

### 3.2 「何をもって完了か」を明示する

Codex の品質は、モデル性能だけでなく「成功条件が見えているか」に大きく依存する。  
OpenAI 公式でも、変更依頼で止めずに、必要に応じて以下まで回させることが推奨されている。

- テスト追加 / 更新
- 関連テスト実行
- lint / format / type check 実行
- 要求どおり動いたかの確認
- diff review

つまり、Codex に対しては「実装して」で終わらせず、**どう検証するかまでセットで渡す**のが基本。

### 3.3 モデル選択はまず `gpt-5.4`

2026-03-29 時点の Codex 公式モデルページでは、**通常の Codex 作業はまず `gpt-5.4` から始める**ことが推奨されている。  
軽量タスクや subagent 的な役割では `gpt-5.4-mini` が推奨。

整理すると:

- メイン実装・設計・複雑な判断: `gpt-5.4`
- 軽い修正・探索・補助タスク: `gpt-5.4-mini`
- 近い将来変わりうるため、モデル固定値は都度公式 docs を確認する

### 3.4 設定は prompt より `config.toml`

OpenAI 公式ドキュメントでは、モデル選択や approval policy、sandbox 関連の設定を `config.toml` と CLI オプションで管理する流れが明示されている。  
つまり、毎回プロンプトで「このモデルを使って」「この権限で」などを繰り返すより、**再現性が必要な挙動は設定として持つ**方がよい。

### 3.5 権限は狭く始める

OpenAI 公式は、Codex に最初から広い権限を与える運用を推奨していない。  
基本は以下。

- Git 管理されたリポジトリでは `Auto` 相当（`workspace-write` + `on-request`）を起点にする
- 調査だけなら `read-only`
- ネットワークは必要時のみ有効化
- `danger-full-access` / `--yolo` は基本非推奨

特に、ネットワーク有効化や live web 検索は prompt injection のリスクを増やすため、必要性が明確なときだけ使うべきとされている。

### 3.6 スレッド運用を雑にしない

公式ベストプラクティスでは、Codex セッションを単なる会話履歴ではなく、**作業コンテキストの単位**として扱うことが推奨されている。

基本ルール:

- 1スレッド = 1つのまとまった課題
- 同じ問題の続きなら同じスレッドを維持
- 本当に分岐したときだけ fork
- 長くなったら compact
- bounded な補助作業は subagent に切り出す

逆に避けるべきこと:

- 1プロジェクト1スレッドで何でも積み続ける
- 複数の live thread を同じファイルへ同時に当てる
- 複雑タスクで planning を飛ばす

### 3.7 skill / automation / MCP は段階導入する

公式の考え方はかなり明確で、役割分担は次の通り。

- `AGENTS.md`: その repo の恒常ルール
- skill: 繰り返す作業手順
- automation: 安定した作業の定期実行
- MCP: 外部システム接続

ベストプラクティスとしては:

- 同じ prompt を何度も使うなら skill 化
- 手順がまだ不安定なら automation にしない
- MCP は最初から大量導入せず、明確に手作業を減らすものだけ足す

## 4. 本プロジェクトへの適用方針

この `blog-audio` では、上のベストプラクティスを次のように適用するのがよい。

1. 近いうちに repo 直下へ `AGENTS.md` を置く
2. `AGENTS.md` には最低限、プロダクトの本質、MVP範囲、スマホUI優先、コードブロックは全文読まないこと、build / test / lint / 完了条件を明文化する
3. 実装タスクは「記事取得」「本文整形」「TTS変換」「プレーヤーUI」など、課題単位でスレッドを分ける
4. まだ定まっていない反復作業は automation 化せず、まず人間主導で運用を固める
5. 外部接続は、最初から広げすぎず、必要が出た時点で段階的に追加する

## 5. API / SDK で Codex を組み込む場合の補足

もし将来的に Codex をプロダクトや内部ツールへ組み込むなら、公式の Prompting Guide で特に重要なのは次の2点。

1. ファイル探索や読み取りは、逐次ではなく**可能な限り並列でまとめて実行する**
2. `gpt-5.3-codex` 系を Responses API で使う場合、assistant output の `phase`（`commentary` / `final_answer`）を保持しないと性能劣化の原因になる

この2点は、Codex を「使う」だけでなく「組み込む」場合に重要な実装注意点である。

## 6. 参照ソース

調査日は 2026-03-29（JST）。一次情報は OpenAI 公式のみを使用。

- Best practices – Codex: https://developers.openai.com/codex/learn/best-practices
- Models – Codex: https://developers.openai.com/codex/models
- Agent approvals & security – Codex: https://developers.openai.com/codex/agent-approvals-security
- Codex Prompting Guide: https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
