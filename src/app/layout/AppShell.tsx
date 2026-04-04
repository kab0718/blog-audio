import { NavLink, Outlet, useLocation } from "react-router-dom";
import { usePlayback } from "../playback/PlaybackContext";
import {
  getArticleById,
  getAudioTrackByArticleId,
  mockArticles,
} from "../../data/mockLibrary";
import { toMiniPlayerViewModel } from "../../view-models/library";
import styles from "./AppShell.module.css";

const navItems = [
  { to: "/", label: "Articles", caption: "記事一覧" },
  { to: "/player", label: "Player", caption: "プレーヤー" },
  { to: "/queue", label: "Queue", caption: "キュー" },
];

const routeLabels: Record<string, { eyebrow: string; title: string }> = {
  "/": {
    eyebrow: "Library",
    title: "聴く記事を選ぶ",
  },
  "/player": {
    eyebrow: "Now Playing",
    title: "再生画面の骨格",
  },
  "/queue": {
    eyebrow: "Up Next",
    title: "連続再生の流れを確認",
  },
};

export function AppShell() {
  const location = useLocation();
  const {
    state: { currentQueueItemId, playerStatus },
  } = usePlayback();
  const currentRoute = routeLabels[location.pathname] ?? routeLabels["/"];

  const fallbackArticle = mockArticles[0];

  if (!fallbackArticle) {
    return null;
  }

  const currentArticle = getArticleById(currentQueueItemId) ?? fallbackArticle;
  const currentTrack = getAudioTrackByArticleId(currentArticle.id);
  const miniPlayer = toMiniPlayerViewModel(
    currentArticle,
    currentTrack,
    playerStatus,
  );

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
            1 article = 1 track の体験をモバイル幅で先に固める。
          </p>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <div className={styles.footerStack}>
        <section className={styles.miniPlayerSlot} aria-label="mini player slot">
          <div className={styles.slotLabel}>Mini player</div>
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
