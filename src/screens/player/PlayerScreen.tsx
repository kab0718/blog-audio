import { getArticleById, getAudioTrackByArticleId, mockArticles } from "../../data/mockLibrary";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { toNowPlayingViewModel } from "../../view-models/library";
import styles from "./PlayerScreen.module.css";

export function PlayerScreen() {
  const {
    state: { currentQueueItemId, playerStatus },
  } = usePlayback();

  const fallbackArticle = mockArticles[0];

  if (!fallbackArticle) {
    return null;
  }

  const article = getArticleById(currentQueueItemId) ?? fallbackArticle;
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
            {viewModel.playerStatusLabel} / QueueItem.id = Article.id を前提に再生対象を特定する
          </p>
        </div>
      </div>

      <div className={styles.controlRail}>
        <button type="button" className={styles.control}>
          Prev
        </button>
        <button type="button" className={`${styles.control} ${styles.controlPrimary}`}>
          {viewModel.primaryActionLabel}
        </button>
        <button type="button" className={styles.control}>
          Next
        </button>
      </div>
    </section>
  );
}
