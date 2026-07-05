# タスク文書の実装状況

この一覧は、現在の `src/` 実装に対するタスク文書の状態を整理するためのインデックスです。

- 実装済み: MVP として主要な acceptance criteria を満たす実装が入っている
- 未実装: 実装が未着手、または専用機能としてはまだ入っていない

既存文書からの参照を壊さないため、各タスクファイルは移動せず、この一覧で分類する。

## 実装済み

- [01-app-shell.md](./01-app-shell.md): アプリ骨格とモバイル向け画面遷移
- [02-domain-model.md](./02-domain-model.md): MVP ドメインモデルと再生状態の契約
- [03-zenn-article-list-ingestion.md](./03-zenn-article-list-ingestion.md): Zenn 記事一覧の取り込みと `Article` 正規化
- [04-qiita-article-list.md](./04-qiita-article-list.md): Qiita 記事一覧の取り込みと `Article` 正規化
- [05-article-content-structure-extraction.md](./05-article-content-structure-extraction.md): 記事本文の音声化向け構造抽出
- [06-code-block-summary-pipeline.md](./06-code-block-summary-pipeline.md): コードブロック要約パイプライン
- [07-tts-narration-script-generation.md](./07-tts-narration-script-generation.md): TTS 用ナレーション原稿生成
- [08-audio-track-generation-cache.md](./08-audio-track-generation-cache.md): 音声トラック生成と最小キャッシュ
- [09-zenn-rate-limit-resilient-article-library.md](./09-zenn-rate-limit-resilient-article-library.md): Zenn 記事一覧取得の rate limit 耐性
- [10-playback-controls-track-state-management.md](./10-playback-controls-track-state-management.md): 再生操作とトラック状態管理
- [11-zenn-daily-popular-article-list.md](./11-zenn-daily-popular-article-list.md): Zenn 記事一覧のデイリー人気順取得
- [12-queue-management-continuous-playback.md](./12-queue-management-continuous-playback.md): キュー管理画面と連続再生
- [13-zenn-article-content-html-fetch.md](./13-zenn-article-content-html-fetch.md): Zenn 記事本文取得の詳細 JSON 化
- [14-mobile-article-list-screen.md](./14-mobile-article-list-screen.md): モバイル記事一覧画面
- [15-mobile-player-screen.md](./15-mobile-player-screen.md): モバイルプレーヤー画面
- [16-playback-speed-sleep-timer.md](./16-playback-speed-sleep-timer.md): 再生速度変更とスリープタイマーの実装履歴（スリープタイマーは issue #27 で削除）
- [17-real-tts-audio-generation.md](./17-real-tts-audio-generation.md): 実 TTS 音声生成
- [18-production-api-boundary.md](./18-production-api-boundary.md): 本番用 API 境界
- [22-google-cloud-text-to-speech-setup.md](./22-google-cloud-text-to-speech-setup.md): Google Cloud Text-to-Speech 利用準備と認証設定
- [23-google-cloud-tts-provider-switch.md](./23-google-cloud-tts-provider-switch.md): Google Cloud Text-to-Speech への TTS provider 切り替え
- [24-article-url-queue-add.md](./24-article-url-queue-add.md): ブログ URL からの記事追加とキュー投入

## 未実装

- [19-persisted-queue-playback-restore.md](./19-persisted-queue-playback-restore.md): キューと再生状態の復元
- [20-persistent-audio-track-cache.md](./20-persistent-audio-track-cache.md): 生成済み音声の永続キャッシュ
- [21-pwa-mobile-device-playback-validation.md](./21-pwa-mobile-device-playback-validation.md): PWA とスマホ実機再生検証

## 補足

- [08-audio-track-generation-cache.md](./08-audio-track-generation-cache.md) は in-memory cache による MVP 実装済みとして扱う。永続 cache は [20-persistent-audio-track-cache.md](./20-persistent-audio-track-cache.md) の範囲。
- [09-zenn-rate-limit-resilient-article-library.md](./09-zenn-rate-limit-resilient-article-library.md) の cache は Zenn 記事一覧向けで、生成済み音声の永続 cache は [20-persistent-audio-track-cache.md](./20-persistent-audio-track-cache.md) の範囲。
- [14-mobile-article-list-screen.md](./14-mobile-article-list-screen.md) と [15-mobile-player-screen.md](./15-mobile-player-screen.md) は現行 CSS/画面実装で MVP 実装済みとして扱う。スマホ実機での PWA 検証は [21-pwa-mobile-device-playback-validation.md](./21-pwa-mobile-device-playback-validation.md) の範囲。
- [18-production-api-boundary.md](./18-production-api-boundary.md) は同一 origin API contract と Vite dev/preview middleware までを MVP 実装済みとして扱う。本番 deployment target への移植は運用タスクとして別途判断する。
