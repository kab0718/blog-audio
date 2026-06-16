# PWA とスマホ実機再生を検証する

## 1. Task Summary

- Goal: PWA installability とスマホ実機再生を検証し、mobile-first audio player として最低限の破綻を潰す
- User value: 寝る前や移動中にスマホブラウザ / PWA で使っても、画面崩れや基本再生不能に遭遇しにくくなる
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/01-app-shell.md`
  - `docs/tasks/10-playback-controls-track-state-management.md`
  - `docs/tasks/12-queue-management-continuous-playback.md`
  - Issue #20 `MVP: PWAとスマホ実機再生を検証する` <https://github.com/kab0718/blog-audio/issues/20>
  - 現状実装: `src/app/layout/AppShell.tsx`, `src/screens/player/PlayerScreen.tsx`, `index.html`, `vite.config.ts`

## 2. Scope

### In scope

- PWA manifest の追加または確認
- MVP 最小の icon / theme color / display mode を設定する
- mobile viewport、safe area、standalone 表示で主要操作が重ならないことを確認する
- iOS Safari / Android Chrome 相当で audio playback 制約を確認する
- tab background / lock screen 寄りの既知制限を記録する
- 必要に応じて Media Session API の最小導入を行う
- player / queue / article list の主要操作をスマホ幅で確認する

### Out of scope

- ネイティブアプリ化
- push notification
- 完全な offline playback
- App Store / Play Store 配布
- 高度な background audio 制御
- service worker による本格 offline cache

### Assumptions

- MVP の PWA 対応は installability と basic metadata を優先する
- audio playback はブラウザ制約を受けるため、できない挙動は docs に明記する
- Media Session API は基本 metadata と play / pause / next 程度に留める
- 実機確認ができない場合は、確認できた環境と未確認範囲を明示する

## 3. UX / Behavior

### Primary flow

- ユーザーがスマホでアプリを開く
- article list、player、queue の主要操作が safe area 内で押せる
- PWA installability 要件を満たす場合、ホーム画面追加ができる
- 再生中は可能な範囲で Media Session metadata が表示される
- background / lock screen で制限がある場合、対応範囲が docs に残っている

### Important states / edge cases

- standalone display で bottom navigation が safe area と重ならない
- landscape や狭い viewport でも主要操作が操作不能にならない
- audio autoplay 制約により、初回再生はユーザー操作が必要
- lock screen controls は Media Session API とブラウザ対応状況に依存する
- iOS と Android で background playback の挙動が異なる可能性がある

## 4. Requirements

### Functional requirements

- PWA manifest があり、`name`, `short_name`, `start_url`, `display`, `theme_color`, icons を持つ
- `index.html` が manifest と theme color を参照する
- mobile viewport と safe area を考慮した layout が崩れない
- Play / Pause / Seek / Next が実機または実機相当環境で確認される
- Media Session API を導入する場合、title / artist 相当の metadata と basic actions を設定できる
- background / lock screen 周りの確認結果と制限が docs または task doc に記録される

### Non-functional constraints

- PWA 対応は MVP 最小に留め、offline-first 化へ広げない
- browser ごとの差分を隠さず、確認できた事実として記録する
- スマホ幅で横スクロールや重なりを出さない
- 新しい外部依存は追加しない
- audio generation や queue logic の責務を PWA 対応へ混ぜない

## 5. Technical Approach

### Proposed approach

- `public/manifest.webmanifest` または同等の manifest を追加し、最小 icon を配置する
- `index.html` に manifest link、theme-color、viewport 設定を確認 / 追加する
- CSS tokens / global layout で `env(safe-area-inset-*)` が必要な箇所を確認する
- `AppShell` と各 screen の bottom navigation / controls が safe area 内に収まるよう調整する
- `PlayerScreen` または playback hook に Media Session API の feature detection を追加する
- 確認結果をこの task doc または別 docs に記録する

### Data / API / state considerations

- Media Session metadata は現在 article の title、source、author から作る
- action handlers は既存の `play`, `pause`, `next` に接続し、provider 固有情報を持たない
- icons は MVP では簡易な静的 asset でよく、brand 完成版は後続で扱う
- service worker は installability 要件や方針次第で最小導入に留める

### Dependencies

- `docs/tasks/01-app-shell.md`
- `docs/tasks/15-mobile-player-screen.md`
- `docs/tasks/10-playback-controls-track-state-management.md`
- `docs/tasks/12-queue-management-continuous-playback.md`
- 主な対象は `index.html`, `public/`, `src/app/layout/AppShell.*`, `src/screens/player/PlayerScreen.tsx`

## 6. Risks / Open Questions

- iOS Safari の PWA / background audio 挙動は制限が強く、完全制御できない
- service worker を導入すると cache invalidation や dev 挙動が複雑になる
- icon / manifest の不足で installability が環境ごとに変わる可能性がある
- 実機確認ができない場合、simulator / browser devtools だけでは lock screen 挙動を保証できない
- Media Session API 非対応ブラウザでは no-op にする必要がある

## 7. Acceptance Criteria

- PWA manifest があり、installability の可否を確認できる
- スマホ幅で player / queue / article list の主要操作が重ならない
- 実機または実機相当環境で audio playback の基本操作を確認している
- background / lock screen まわりの対応範囲と制限が記録されている
- Media Session API を導入した場合、非対応ブラウザでクラッシュしない
- `npm run build` が通る

## 8. Implementation Plan

1. `index.html`, `public/`, `AppShell`, player / queue / article list の現状を確認し、PWA manifest と safe area 対応の不足を洗い出す
2. manifest と最小 icon / theme color を追加し、`index.html` から参照する
3. viewport、standalone display、safe area を確認し、bottom navigation と player controls が重ならないよう CSS を調整する
4. Media Session API の feature detection と metadata / basic action handlers を追加するか判断し、必要なら最小実装する
5. dev server で mobile viewport を確認し、Play / Pause / Seek / Next の操作が破綻しないことを確認する
6. iOS Safari / Android Chrome 相当で確認できた挙動、background / lock screen の制限、未確認範囲を docs に記録する
7. `npm run build` を実行する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - mobile viewport で article list / player / queue の主要操作が重ならないことを確認する
  - PWA manifest が browser devtools で認識されることを確認する
  - Play / Pause / Seek / Next をスマホ実機または実機相当環境で確認する
  - standalone display で safe area と bottom navigation が重ならないことを確認する
  - Media Session API 対応環境で metadata / controls が可能な範囲で動くことを確認する
- Known limitations:
  - background / lock screen 再生はブラウザと OS の制約を受け、完全な保証は MVP scope 外
  - このタスクでは offline playback と service worker cache の本格対応は扱わない
