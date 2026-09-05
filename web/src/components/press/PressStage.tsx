import { useMemo, useRef, useState } from "react";
import StatusPill from "../common/StatusPill";
import CountdownDisplay from "./CountdownDisplay";
import PressButton from "./PressButton";
import PressStatusLine from "./PressStatusLine";
import LocalDeadState from "./LocalDeadState";
import OnboardingModal from "../onboarding/OnboardingModal";
import { useCountdown } from "../../hooks/useCountdown";
import { useGameState } from "../../hooks/useGameState";
import { useUsername } from "../../hooks/useUsername";
import styles from "./PressStage.module.css";

interface MyPress {
  hasPressed: boolean;
  faction: number;
  remaining: number;
  pressNumber: number;
}

const MY_PRESS_KEY = "button-my-press";

function loadMyPress(username: string | null): MyPress {
  if (!username) return { hasPressed: false, faction: 0, remaining: 0, pressNumber: 0 };
  try {
    const raw = localStorage.getItem(`${MY_PRESS_KEY}-${username.toLowerCase()}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { hasPressed: false, faction: 0, remaining: 0, pressNumber: 0 };
}

function saveMyPress(username: string, press: MyPress) {
  try {
    localStorage.setItem(`${MY_PRESS_KEY}-${username.toLowerCase()}`, JSON.stringify(press));
  } catch {
    // ignore — this is only a convenience cache, never the source of truth
  }
}

/** The database-backed press flow — no wallet, no wagmi, no chain. A username
 *  (see useUsername) stands in for a wallet address; the server's unique
 *  index on it is what makes "one press, forever" real, not this component.
 *  See SECURITY.md for what's honestly different from the original onchain
 *  design (chiefly: a username is re-creatable in a way a funded wallet with
 *  history isn't — there is no equivalent anti-Sybil property here). */
export default function PressStage() {
  const state = useGameState();
  const { username, setUsername } = useUsername();
  const [myPress, setMyPress] = useState<MyPress>(() => loadMyPress(username));
  const [txStatus, setTxStatus] = useState("");
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);

  const deadlineMs = state.loaded ? state.deadlineMs : null;
  const sealed = !state.started;
  const alive = state.started && state.alive;
  const reading = useCountdown(deadlineMs, { sealed, alive });

  const deadlineLabel = !state.started
    ? "AWAITING ONE-TIME ACTIVATION"
    : state.alive && state.deadlineMs
      ? `DEADLINE · ${new Date(state.deadlineMs).toLocaleTimeString([], { hour12: false })}`
      : state.deadlineMs
        ? `ENDED · ${new Date(state.deadlineMs).toLocaleString()}`
        : "N/A";

  const statusLabel = !state.loaded
    ? state.error || "LOADING SHARED STATE"
    : state.stale
      ? "SERVER STALE · SHOWING LAST KNOWN STATE"
      : !state.started
        ? "THE BUTTON IS SEALED"
        : state.alive
          ? "EXPERIMENT LIVE · SHARED CLOCK RUNNING"
          : "EXPERIMENT ENDED · HISTORY FROZEN";

  const statusTone = !state.loaded
    ? state.error ? "stale" : ""
    : state.stale
      ? "stale"
      : !state.started
        ? ""
        : state.alive
          ? "live"
          : "dead";

  const buttonLabel = !state.loaded
    ? "WAIT"
    : !state.started
      ? "SEALED"
      : !state.alive
        ? "ENDED"
        : myPress.hasPressed
          ? "SPENT"
          : state.stale
            ? "STALE"
            : pending
              ? "PENDING"
              : "PRESS";

  const buttonDisabled = !state.loaded || !state.started || !state.alive || myPress.hasPressed || state.stale || pending;

  async function handlePress() {
    if (submittingRef.current || !username || myPress.hasPressed) return;
    if (!state.started || !state.alive || state.stale) return;

    submittingRef.current = true;
    setPending(true);
    setTxStatus("SUBMITTING YOUR PRESS…");
    try {
      const res = await fetch("/api/press", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (!res.ok) {
        setTxStatus(data.message || `PRESS FAILED · ${data.error || "UNKNOWN ERROR"}`);
        if (data.error === "ALREADY_PRESSED") {
          // A different browser/session already spent this exact username —
          // reflect that permanently here too rather than leaving PRESS enabled.
          const spent = { hasPressed: true, faction: 0, remaining: 0, pressNumber: 0 };
          setMyPress(spent);
          saveMyPress(username, spent);
        }
        return;
      }
      const confirmed: MyPress = { hasPressed: true, faction: data.faction, remaining: data.remainingSeconds, pressNumber: data.pressNumber };
      setMyPress(confirmed);
      saveMyPress(username, confirmed);
      setTxStatus("RECORDED · YOUR PRESS IS PERMANENT");
    } catch {
      setTxStatus("PRESS FAILED · COULD NOT REACH THE SERVER. TRY AGAIN.");
    } finally {
      setPending(false);
      submittingRef.current = false;
    }
  }

  const identity = useMemo(
    () => ({
      connected: Boolean(username),
      loaded: true,
      hasPressed: myPress.hasPressed,
      faction: myPress.faction,
      remaining: myPress.remaining,
      pressNumber: myPress.pressNumber,
      txHash: "",
      presser: username ?? "",
      isNewClosestCall: Boolean(username) && state.closestCallUsername?.toLowerCase() === username?.toLowerCase()
    }),
    [username, myPress, state.closestCallUsername]
  );

  const isDead = state.loaded && state.started && !state.alive;

  if (isDead) {
    return <LocalDeadState state={state} />;
  }

  return (
    <section className={styles.hero} id="experiment">
      {!username && <OnboardingModal onComplete={setUsername} />}
      <StatusPill label={statusLabel} tone={statusTone as "" | "live" | "dead" | "stale"} />
      <CountdownDisplay reading={reading} deadlineLabel={deadlineLabel} pulseKey={String(state.totalPresses)} />
      <PressButton label={buttonLabel} disabled={buttonDisabled} onPress={handlePress} />
      <PressStatusLine identity={identity} txStatus={txStatus || state.error || ""} />
    </section>
  );
}
