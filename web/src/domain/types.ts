export interface Faction {
  id: number;
  name: string;
  range: string;
  color: string;
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
  factionCounts: [number, number, number, number, number, number, number];
  currentBlock: number;
  chainOffsetMs: number;
}

export interface UserPressState {
  loaded: boolean;
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
