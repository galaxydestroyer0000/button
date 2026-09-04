import { useState } from "react";
import { FACTIONS } from "../domain/factions";
import { runtimeConfig } from "../config/runtimeConfig";
import { useEventPage } from "../hooks/useEventPage";
import FeedRow from "../components/feed/FeedRow";
import FeedEmptyState from "../components/feed/FeedEmptyState";
import FeedSkeleton from "../components/feed/FeedSkeleton";
import type { EventSyncStatus } from "../hooks/useEventSync";
import styles from "./HistoryPage.module.css";

const PAGE_SIZE = 50;

export default function HistoryPage({ sync }: { sync: EventSyncStatus }) {
  const [page, setPage] = useState(1);
  const [factionInput, setFactionInput] = useState("");
  const [presserInput, setPresserInput] = useState("");
  const [pressNumberInput, setPressNumberInput] = useState("");

  const faction = factionInput ? Number(factionInput) : undefined;
  const presser = /^0x[a-fA-F0-9]{40}$/.test(presserInput.trim()) ? (presserInput.trim() as `0x${string}`) : undefined;
  const pressNumber = pressNumberInput && /^\d+$/.test(pressNumberInput) ? Number(pressNumberInput) : undefined;
  const hasActiveFilter = faction !== undefined || presser !== undefined || pressNumber !== undefined;

  const { items, total } = useEventPage(sync, page, PAGE_SIZE, { faction, presser, pressNumber });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loading = sync.freshness === "SYNCING" && total === 0 && !hasActiveFilter;

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>HISTORY</span>
          <h2>Every press, filterable.</h2>
        </div>
        <span className={styles.freshness}>{runtimeConfig.previewMode ? "PREVIEW — NO HISTORY" : sync.freshness}</span>
      </div>

      <form className={styles.filters} onSubmit={(e) => e.preventDefault()}>
        <label>
          FACTION
          <select value={factionInput} onChange={(e) => updateFilter(setFactionInput, e.target.value)}>
            <option value="">ALL</option>
            {[1, 2, 3, 4, 5, 6].map((id) => (
              <option key={id} value={id}>
                {FACTIONS[id].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          WALLET
          <input
            type="text"
            placeholder="0x…"
            value={presserInput}
            onChange={(e) => updateFilter(setPresserInput, e.target.value)}
          />
        </label>
        <label>
          PRESS #
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 42"
            value={pressNumberInput}
            onChange={(e) => updateFilter(setPressNumberInput, e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        {hasActiveFilter && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setFactionInput("");
              setPresserInput("");
              setPressNumberInput("");
              setPage(1);
            }}
          >
            CLEAR FILTERS
          </button>
        )}
      </form>

      <div className={styles.tape}>
        {runtimeConfig.previewMode ? (
          <FeedEmptyState />
        ) : loading ? (
          <FeedSkeleton />
        ) : items.length === 0 ? (
          <FeedEmptyState />
        ) : (
          items.map((event) => <FeedRow key={event.key} event={event} isNew={false} />)
        )}
      </div>

      {!runtimeConfig.previewMode && total > 0 && (
        <div className={styles.pagination}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ← PREV
          </button>
          <span>
            PAGE {page} OF {totalPages} · {total.toLocaleString()} PRESS{total === 1 ? "" : "ES"}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            NEXT →
          </button>
        </div>
      )}
    </section>
  );
}
