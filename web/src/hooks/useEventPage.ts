import { useEffect, useState } from "react";
import { queryPage, type EventFilters, type EventPage } from "../data/eventDb";
import type { EventSyncStatus } from "./useEventSync";

const EMPTY_PAGE: EventPage = { items: [], total: 0 };

/** Paginated, filterable read against the local event store. Re-queries whenever the
 *  sync layer's `version` advances (new data landed) or the page/filters change. */
export function useEventPage(sync: EventSyncStatus, page: number, pageSize: number, filters: EventFilters = {}): EventPage {
  const [pageData, setPageData] = useState<EventPage>(EMPTY_PAGE);
  const { faction, presser, pressNumber } = filters;

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    queryPage(sync.db, page, pageSize, { faction, presser, pressNumber }).then((result) => {
      if (!cancelled) setPageData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, page, pageSize, faction, presser, pressNumber]);

  return pageData;
}
