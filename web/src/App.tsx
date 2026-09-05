import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import SystemStrip from "./components/layout/SystemStrip";
import GlobalPulse from "./components/common/GlobalPulse";
import HomePage from "./pages/HomePage";
import { useExperimentState } from "./hooks/useExperimentState";
import { useEventSync } from "./hooks/useEventSync";

// The homepage is the entry point for nearly every visitor and stays in the main
// bundle; these secondary pages are split into their own chunks so a first-time
// visitor's initial load doesn't pay for /history, /stats, /press, /wallet code
// they may never navigate to.
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const PressPage = lazy(() => import("./pages/PressPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
// Deliberately unlinked from nav (see the "Admin page location" decision) — the
// contract itself is the real access control, this route is just not advertised.
const AdminPage = lazy(() => import("./pages/AdminPage"));

function RouteLoading() {
  return (
    <div
      role="status"
      style={{
        padding: "80px 24px",
        textAlign: "center",
        color: "#77746e",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "11px",
        letterSpacing: ".12em",
        textTransform: "uppercase"
      }}
    >
      LOADING…
    </div>
  );
}

export default function App() {
  const state = useExperimentState();
  // One sync instance for the whole app session — it must not restart on every route
  // change, so it's owned here, above the router, and its status/data flow down.
  const sync = useEventSync(state);

  return (
    <AppShell footer={<SystemStrip state={state} />}>
      <GlobalPulse pulseEvent={sync.pulseEvent} />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/history"
          element={
            <Suspense fallback={<RouteLoading />}>
              <HistoryPage />
            </Suspense>
          }
        />
        <Route
          path="/stats"
          element={
            <Suspense fallback={<RouteLoading />}>
              <StatsPage />
            </Suspense>
          }
        />
        <Route
          path="/press/:number"
          element={
            <Suspense fallback={<RouteLoading />}>
              <PressPage state={state} sync={sync} />
            </Suspense>
          }
        />
        <Route
          path="/wallet/:address"
          element={
            <Suspense fallback={<RouteLoading />}>
              <WalletPage />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<RouteLoading />}>
              <AdminPage state={state} />
            </Suspense>
          }
        />
      </Routes>
    </AppShell>
  );
}
