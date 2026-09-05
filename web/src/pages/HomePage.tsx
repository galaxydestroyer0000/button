import PressStage from "../components/press/PressStage";
import TokenPanel from "../components/token/TokenPanel";
import RulesSection from "../components/rules/RulesSection";

// LivePressFeed, StatsPanel, and IdentityPanel are still wired to the old
// onchain read layer (App.tsx's useExperimentState/useEventSync) —
// intentionally left off the homepage rather than shown here half-migrated
// and disconnected from what PressStage now actually records. /history and
// /stats are already rebuilt against /api/history and /api/stats (see those
// pages); a homepage live-tape widget sourced the same way is a natural
// follow-up, not yet done. See SECURITY.md for the full account of what
// changed and why.
export default function HomePage() {
  return (
    <>
      <PressStage />
      <TokenPanel />
      <RulesSection />
    </>
  );
}
