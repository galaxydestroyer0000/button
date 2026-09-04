import AppShell from "./components/layout/AppShell";
import SystemStrip from "./components/layout/SystemStrip";
import PressStage from "./components/press/PressStage";
import LivePressFeed from "./components/feed/LivePressFeed";
import StatsPanel from "./components/stats/StatsPanel";
import TokenPanel from "./components/token/TokenPanel";
import IdentityPanel from "./components/identity/IdentityPanel";
import RulesSection from "./components/rules/RulesSection";
import ProofSection from "./components/rules/ProofSection";
import { useExperimentState } from "./hooks/useExperimentState";
import { usePressFeed } from "./hooks/usePressFeed";
import { usePreviewClock } from "./hooks/usePreviewClock";
import { useUserPress } from "./hooks/useUserPress";
import { runtimeConfig } from "./config/runtimeConfig";

export default function App() {
  const state = useExperimentState();
  const feed = usePressFeed(state);
  const preview = usePreviewClock();
  const userPress = useUserPress();
  const events = runtimeConfig.previewMode ? preview.events : feed.events;

  return (
    <AppShell footer={<SystemStrip state={state} />}>
      <PressStage state={state} feed={feed} preview={preview} userPress={userPress} />
      <LivePressFeed feed={feed} preview={runtimeConfig.previewMode ? preview : null} />
      <StatsPanel state={state} events={events} preview={runtimeConfig.previewMode ? preview : null} />
      <IdentityPanel preview={preview} userPress={userPress} />
      <TokenPanel />
      <RulesSection />
      <ProofSection state={state} />
    </AppShell>
  );
}
