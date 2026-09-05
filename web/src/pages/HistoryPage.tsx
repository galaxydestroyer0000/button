import { useState } from "react";
import { FACTIONS } from "../domain/factions";
import { useHistoryPage } from "../hooks/useHistoryPage";
import HistoryRow from "../components/feed/HistoryRow";
import FeedEmptyState from "../components/feed/FeedEmptyState";
import FeedSkeleton from "../components/feed/FeedSkeleton";
import styles from "./HistoryPage.module.css";

const PAGE_SIZE = 50;

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [factionInput, setFactionInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [pressNumberInput, setPressNumberInput] = useState("");

  const faction = factionInput ? Number(factionInput) : undefined;
  const username = usernameInput.trim() || undefined;
  const pressNumber = pressNumberInput && /^\d+$/.test(pressNumberInput) ? Number(pressNumberInput) : undefined;
  const hasActiveFilter = faction !== undefined || username !== undefined || pressNumber !== undefined;

  const { items, total, loading, error } = useHistoryPage(page, { faction, username, pressNumber });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <span className={styles.freshness}>{error ? "SERVER ERROR" : "LIVE · DATABASE"}</span>
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
          USERNAME
          <input type="text" placeholder="e.g. closest_call_99" value={usernameInput} onChange={(e) => updateFilter(setUsernameInput, e.target.value)} />
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
              setUsernameInput("");
              setPressNumberInput("");
              setPage(1);
            }}
          >
            CLEAR FILTERS
          </button>
        )}
      </form>

      <div className={styles.tape}>
        {loading ? <FeedSkeleton /> : items.length === 0 ? <FeedEmptyState /> : items.map((event) => <HistoryRow key={event.pressNumber} event={event} />)}
      </div>

      {total > 0 && (
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
