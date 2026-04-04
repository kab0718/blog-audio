import { mockArticles } from "../../data/mockArticles";
import { usePlayback } from "../../app/playback/PlaybackContext";
import styles from "./PlayerScreen.module.css";

export function PlayerScreen() {
  const {
    state: { currentArticleId },
  } = usePlayback();

  const article =
    mockArticles.find((candidate) => candidate.id === currentArticleId) ?? mockArticles[0];

  return (
    <section className={styles.screen}>
      <div className={styles.hero}>
        <p className={styles.kicker}>Player</p>
        <h2 className={styles.title}>{article.title}</h2>
        <p className={styles.meta}>
          {article.sourceType} ・ {article.author} ・ {article.durationMinutes} min
        </p>
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
          <span className={styles.label}>Screen role</span>
          <p className={styles.value}>再生に集中するメイン面</p>
        </div>
        <div>
          <span className={styles.label}>Next task</span>
          <p className={styles.value}>実プレーヤー UI と操作を差し込む</p>
        </div>
      </div>

      <div className={styles.controlRail}>
        <button type="button" className={styles.control}>
          Prev
        </button>
        <button type="button" className={`${styles.control} ${styles.controlPrimary}`}>
          Play
        </button>
        <button type="button" className={styles.control}>
          Next
        </button>
      </div>
    </section>
  );
}
