# 実行単位の分離

1回のスキル実行を、1件のIssue、1ブランチ、1worktree、1 Draft PRの唯一の所有者として扱う。

## 識別子

Issue番号と短いslugから安定した名前を作る。

```text
branch:   codex/issue-42-player-seek
worktree: <repo-root>/.worktrees/issue-42-player-seek
```

worktreeは必ず対象リポジトリのルート直下にある`.worktrees/`へ作成する。作成前に`.git/info/exclude`へ`.worktrees/`が登録済みか確認し、未登録の場合だけ追加する。trackedな`.gitignore`は変更せず、元worktreeの`git status --short`にworktreeディレクトリを出さない。

Issue番号がない場合は一意なタスク識別子を使う。パスやブランチが無関係または所有者不明の作業に使われている場合は、変更せず短い一意な接尾辞を付ける。

## 衝突確認

作成または再開前に次を確認する。

- `git worktree list`
- ローカル・リモートブランチ
- 候補worktreeの状態
- 同じブランチまたはIssueに対する既存Draft PR

識別子とスコープがすべて一致する場合だけ既存作業を再開する。他の実行のブランチやworktreeをreset、clean、削除、rename、横取りしない。

## リソース分離

- ファイル編集とgit操作をすべて専用worktree内で行う。
- 別サーバーが動作している可能性があればIssue専用の開発ポートを使う。
- スクリーンショット、ログ、パッチ、一時出力をIssue専用の一時ディレクトリへ保存する。
- 共有される可変scratchファイルを使わない。
- ユーザーの元worktreeからstage、commit、pushしない。

## 公開の所有権

- 今回の実行ブランチだけを公開する。
- ユーザー指定がない限り、1回の実行につきDraft PRは1件だけ作成する。
- push前に、同じブランチが別の実行で更新されていないことを確認する。
- remoteブランチが予期せず進んでいた場合は、force pushせず停止して調査する。

## 後片付け

PRレビュー修正を継続できるよう、Draft PR作成後もworktreeを残す。ユーザーから削除を依頼された場合、またはリポジトリ規約で必要な場合だけ削除する。固有の未コミット変更があるworktreeは削除しない。
