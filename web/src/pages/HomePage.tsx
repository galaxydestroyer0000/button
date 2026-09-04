import PressStage from "../components/press/PressStage";
import LivePressFeed from "../components/feed/LivePressFeed";
import StatsPanel from "../components/stats/StatsPanel";
import TokenPanel from "../components/token/TokenPanel";
import IdentityPanel from "../components/identity/IdentityPanel";
import RulesSection from "../components/rules/RulesSection";
import ProofSection from "../components/rules/ProofSection";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { runtimeConfig } from "../config/runtimeConfig";
import type { ExperimentState, UserPressState } from "../domain/types";
import type { EventSyncStatus } from "../hooks/useEventSync";
import type { PreviewClockState } from "../hooks/usePreviewClock";

const HOMEPAGE_FEED_LIMIT = 14;

export default function HomePage({
  state,
  sync,
  preview,
  userPress
}: {
  state: ExperimentState;
  sync: EventSyncStatus;
  preview: PreviewClockState;
  userPress: UserPressState;
}) {
  const liveEvents = useLiveFeed(sync, HOMEPAGE_FEED_LIMIT);
  const feed = { events: liveEvents, freshness: sync.freshness, latestKey: sync.latestKey };
  const events = runtimeConfig.previewMode ? preview.events : liveEvents;

  return (
    <>
      <PressStage state={state} feed={feed} preview={preview} userPress={userPress} sync={sync} />
      <LivePressFeed feed={feed} preview={runtimeConfig.previewMode ? preview : null} />
      <StatsPanel state={state} events={events} preview={runtimeConfig.previewMode ? preview : null} pulseEvent={sync.pulseEvent} />
      <IdentityPanel preview={preview} userPress={userPress} />
      <TokenPanel />
      <RulesSection />
      <ProofSection state={state} />
    </>
  );
}
