import { runtimeConfig } from "../../config/runtimeConfig";
import type { PressFeed } from "../../hooks/usePressFeed";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import FeedRow from "./FeedRow";
import FeedSkeleton from "./FeedSkeleton";
import FeedEmptyState from "./FeedEmptyState";
import styles from "./LivePressFeed.module.css";

export default function LivePressFeed({ feed, preview }: { feed: PressFeed; preview: PreviewClockState | null }) {
  const events = runtimeConfig.previewMode ? preview!.events : feed.events;
  const freshness = runtimeConfig.previewMode ? "PREVIEW" : feed.freshness;
  const loading = !runtimeConfig.previewMode && feed.freshness === "SYNCING" && events.length === 0;

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>LIVE TAPE</span>
          <h2>Every press leaves a mark.</h2>
        </div>
        <span className={styles.freshness}>{freshness}</span>
      </div>
      <div className={styles.tape}>
        {loading ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <FeedEmptyState />
        ) : (
          events.slice(0, 14).map((event, idx) => <FeedRow key={event.key} event={event} isNew={idx === 0} />)
        )}
      </div>
    </section>
  );
}
