import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useArticleLibrary } from "../articles/ArticleLibraryContext";
import { usePlayback } from "../playback/PlaybackContext";
import { useAudioTracks } from "../tracks/AudioTrackContext";
import { toMiniPlayerViewModel } from "../../view-models/library";
import styles from "./AppShell.module.css";

const navItems = [
  { to: "/", label: "探す", caption: "Library" },
  { to: "/player", label: "聴く", caption: "Player" },
  { to: "/queue", label: "並べる", caption: "Queue" },
];

const routeLabels: Record<
  string,
  { eyebrow: string; title: string; subtitle: string }
> = {
  "/": {
    eyebrow: "記事を探す",
    title: "技術記事を聴く",
    subtitle: "Zenn / Qiita の記事を選び、1本の音声トラックとして再生します。",
  },
  "/player": {
    eyebrow: "再生中",
    title: "いま聴いている記事",
    subtitle: "本文は自然に、コードブロックは要約して聴ける形に整えます。",
  },
  "/queue": {
    eyebrow: "再生キュー",
    title: "次に流す記事",
    subtitle: "再生順を確認し、聴きたい記事だけをキューに残します。",
  },
};

export function AppShell() {
  const location = useLocation();
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, playerStatus },
  } = usePlayback();
  const { getTrackByArticleId } = useAudioTracks();
  const currentRoute = routeLabels[location.pathname] ?? routeLabels["/"];
  const currentArticle = getArticleById(currentQueueItemId);
  const currentTrack = getTrackByArticleId(currentArticle?.id ?? null);
  const miniPlayer = currentArticle
    ? toMiniPlayerViewModel(currentArticle, currentTrack, playerStatus)
    : getEmptyMiniPlayer(status);

  return (
    <div className={styles.viewport}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.brand}>Blog Audio</p>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>{currentRoute.eyebrow}</p>
            <h1 className={styles.title}>{currentRoute.title}</h1>
          </div>
          <p className={styles.subtitle}>
            {currentRoute.subtitle}
          </p>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <div className={styles.footerStack}>
        <section className={styles.miniPlayerSlot} aria-label="ミニプレーヤー">
          <div className={styles.slotLabel}>ミニプレーヤー</div>
          <p className={styles.slotTitle}>{miniPlayer.title}</p>
          <p className={styles.slotCopy}>{miniPlayer.statusLine}</p>
        </section>

        <nav className={styles.navigation} aria-label="primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              }
            >
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.navCaption}>{item.caption}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function getEmptyMiniPlayer(status: string) {
  switch (status) {
    case "loading":
      return {
        title: "記事を読み込み中",
        statusLine: "Article sources",
      };
    case "error":
      return {
        title: "記事を取得できません",
        statusLine: "Articles unavailable",
      };
    case "empty":
      return {
        title: "記事がありません",
        statusLine: "Queue is empty",
      };
    default:
      return {
        title: "再生対象なし",
        statusLine: "Queue is empty",
      };
  }
}
