import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { getAudioTrackByArticleId } from "../../data/mockLibrary";
import { toNowPlayingViewModel } from "../../view-models/library";
import styles from "./PlayerScreen.module.css";

export function PlayerScreen() {
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, playerStatus },
  } = usePlayback();

  const article = getArticleById(currentQueueItemId);

  if (!article) {
    return (
      <section className={styles.screen}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Player</p>
          <h2 className={styles.title}>再生対象なし</h2>
          <p className={styles.meta}>{getEmptyPlayerCopy(status)}</p>
        </div>
        <div className={styles.emptyState}>
          Zenn 記事一覧の取得後、記事を選ぶとここに再生対象が表示されます。
        </div>
      </section>
    );
  }

  const track = getAudioTrackByArticleId(article.id);
  const viewModel = toNowPlayingViewModel(article, track, playerStatus);

  return (
    <section className={styles.screen}>
      <div className={styles.hero}>
        <p className={styles.kicker}>Player</p>
        <h2 className={styles.title}>{viewModel.title}</h2>
        <p className={styles.meta}>{viewModel.metaLine}</p>
      </div>

      <div className={styles.wavePlane} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className={styles.readout}>
        <div>
          <span className={styles.label}>Audio track</span>
          <p className={styles.value}>
            {viewModel.audioTrackLabel} / {viewModel.audioTrackCopy}
          </p>
        </div>
        <div>
          <span className={styles.label}>Playback state</span>
          <p className={styles.value}>
            {viewModel.playerStatusLabel} / QueueItem.id = Article.id
            を前提に再生対象を特定する
          </p>
        </div>
      </div>

      <div className={styles.controlRail}>
        <button type="button" className={styles.control}>
          Prev
        </button>
        <button
          type="button"
          className={`${styles.control} ${styles.controlPrimary}`}
        >
          {viewModel.primaryActionLabel}
        </button>
        <button type="button" className={styles.control}>
          Next
        </button>
      </div>
    </section>
  );
}

function getEmptyPlayerCopy(status: string) {
  switch (status) {
    case "loading":
      return "Zenn の記事一覧を読み込んでいます。";
    case "error":
      return "記事一覧を取得できないため、再生対象を選べません。";
    case "empty":
      return "表示できる記事がありません。";
    default:
      return "記事一覧から再生する記事を選択してください。";
  }
}
