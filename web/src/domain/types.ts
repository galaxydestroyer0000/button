export interface Faction {
  id: number;
  name: string;
  range: string;
  color: string;
  /** A short seed, not a story — one line the identity card and faction badges use.
   *  Deliberately unelaborated so the culture forms in what people do with it, not
   *  in copy this app dictates. */
  seed: string;
}

export interface ExperimentState {
  loaded: boolean;
  stale: boolean;
  started: boolean;
  alive: boolean;
  startedAt: number;
  deadline: number;
  totalPresses: number;
  closestCall: number;
  closestCallWallet: `0x${string}` | "";
  lastPresser: `0x${string}` | "";
  factionCounts: [number, number, number, number, number, number, number];
  currentBlock: number;
  chainOffsetMs: number;
  error: string | null;
}

export interface UserPressState {
  loaded: boolean;
  stale: boolean;
  hasPressed: boolean;
  faction: number;
  remaining: number;
}

export interface PressEvent {
  key: string;
  txHash: string;
  presser: `0x${string}`;
  remaining: number;
  faction: number;
  timestamp: number;
  pressNumber: number;
  blockNumber: number;
  logIndex: number;
}

/** The shape HomePage assembles for the live tape / countdown-pulse consumers from
 *  `useLiveFeed` + `useEventSync`'s status — not a hook's own return type, since the
 *  IndexedDB-backed sync layer (see useEventSync.ts) is the one real event pipeline. */
export interface PressFeed {
  events: PressEvent[];
  freshness: "SYNCING" | "LIVE · ONCHAIN" | "TAPE STALE";
  latestKey: string;
}
