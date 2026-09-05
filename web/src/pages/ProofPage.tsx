import { runtimeConfig } from "../config/runtimeConfig";
import { addressUrl, txUrl } from "../config/network";
import { usePageMeta } from "../lib/pageMeta";
import { useGameState } from "../hooks/useGameState";
import styles from "./ProofPage.module.css";

const TX_HASH = /^0x[a-fA-F0-9]{64}$/;

/** A recorded tx hash, or the honest "not yet recorded" state — never a guess and
 *  never a placeholder value standing in for a real one. */
function TxFact({ label, hash }: { label: string; hash: string }) {
  const valid = TX_HASH.test(hash);
  return (
    <div>
      <span>{label}</span>
      <code>
        {valid && !runtimeConfig.previewMode ? (
          <a href={txUrl(runtimeConfig.network.explorer, hash)} target="_blank" rel="noopener noreferrer">
            {hash}
          </a>
        ) : (
          "NOT YET RECORDED"
        )}
      </code>
    </div>
  );
}

/**
 * The honest version of this page after the wallet-friction pivot (see
 * SECURITY.md). The old claim here was "verify everything yourself, trust
 * nothing" — true for a public blockchain, structurally impossible for a
 * private database. This page says so plainly instead of quietly relabeling
 * the same claims: what's server-reported (the actual game) is marked as
 * such, and what's still genuinely, independently verifiable (the deployed
 * contract admin operates) is kept clearly separate.
 */
export default function ProofPage() {
  usePageMeta({
    title: "Proof",
    description: "What's independently verifiable here, what isn't anymore, and why, plus the deployed contract admin still operates."
  });

  const state = useGameState();

  const statusLabel = !state.loaded ? "READING SERVER STATE…" : !state.started ? "SEALED, NOT YET ACTIVATED" : state.alive ? "LIVE" : "ENDED, PERMANENT DEAD STATE";

  return (
    <>
      <section className={styles.section}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>PROOF</span>
          <h2>What you can verify, and what you have to trust.</h2>
          <p className={styles.lede}>
            This experiment used to run entirely onchain: every press independently verifiable by anyone, with no
            server in the loop at all. It doesn't anymore: pressing no longer requires a wallet, which means it's no
            longer a wallet-signed, publicly-verifiable transaction either. The facts below are honestly labeled by
            which kind they are.
          </p>
        </div>

        <div className={styles.facts}>
          <div>
            <span>EXPERIMENT STATUS</span>
            <code>{statusLabel}</code>
          </div>
          <div>
            <span>TOTAL PRESSES</span>
            <code>{state.loaded ? state.totalPresses.toLocaleString() : "N/A"}</code>
          </div>
          <div>
            <span>PRESS HISTORY</span>
            <code>
              <a href="/history">VIEW ALL {state.loaded ? state.totalPresses.toLocaleString() : ""} PRESSES →</a>
            </code>
          </div>
        </div>
        <p className={styles.lede} style={{ marginTop: 16 }}>
          Everything above is <strong>server-reported, not independently verifiable.</strong> It comes from a
          private Postgres database this site's operator controls directly. There's no public ledger, no
          cryptographic signature per press, and no way for you to check a specific press against a source you don't
          have to trust. That's the honest cost of removing the wallet: real scarcity ("one press, forever") is now
          enforced by server-side code you can read (it's open source) but can't independently audit running live,
          the way you could a smart contract's onchain state. See SECURITY.md in the repository for the complete
          account of this trade-off.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>STILL REAL</span>
          <h2>The deployed contract admin actually operates.</h2>
          <p className={styles.lede}>
            <code>ButtonExperiment.sol</code> is still a real, deployed, verified smart contract. It's just no
            longer what regular presses touch. The operator's <code>/admin</code> page calls its real{" "}
            <code>start()</code>/<code>resetTimer()</code> functions with a real wallet, and every one of those
            calls is a genuine, independently-checkable onchain transaction. What follows is 100% real and
            verifiable the way the whole experiment used to be. It just no longer represents what you, a regular
            visitor, experience.
          </p>
        </div>

        <div className={styles.facts}>
          <div>
            <span>NETWORK</span>
            <code>{runtimeConfig.previewMode ? "N/A" : `${runtimeConfig.network.name.toUpperCase()} · CHAIN ${runtimeConfig.network.chainId}`}</code>
          </div>
          <div>
            <span>EXPERIMENT CONTRACT</span>
            <code>
              {runtimeConfig.previewMode ? (
                "NOT CONFIGURED"
              ) : (
                <a href={addressUrl(runtimeConfig.network.explorer, runtimeConfig.contractAddress)} target="_blank" rel="noopener noreferrer">
                  {runtimeConfig.contractAddress}
                </a>
              )}
            </code>
          </div>
          <div>
            <span>VERIFIED SOURCE</span>
            <code>
              {runtimeConfig.previewMode ? (
                "N/A"
              ) : (
                <a href={`${addressUrl(runtimeConfig.network.explorer, runtimeConfig.contractAddress)}#code`} target="_blank" rel="noopener noreferrer">
                  VIEW ON BLOCKSCOUT ↗
                </a>
              )}
            </code>
          </div>
          <TxFact label="DEPLOYMENT TRANSACTION" hash={runtimeConfig.raw.deployTx} />
          <div>
            <span>DEPLOYMENT BLOCK</span>
            <code>{runtimeConfig.deployBlock !== null ? runtimeConfig.deployBlock.toString() : "N/A"}</code>
          </div>
          <TxFact label="ACTIVATION (start) TRANSACTION" hash={runtimeConfig.raw.startTx} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>Architecture</h2>
        </div>
        <ArchitectureDiagram />
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>Reproducible verification: the contract half only</h2>
          <p className={styles.lede}>
            Run these yourself, with no dependency on this website, using only <code>cast</code> (part of{" "}
            <a href="https://book.getfoundry.sh/" target="_blank" rel="noopener noreferrer">
              Foundry
            </a>
            ) and the contract address above. There is no equivalent set of commands for the database-backed game.
            That's exactly the trade-off explained above, not an oversight here.
          </p>
        </div>
        <ol className={styles.steps}>
          <li>
            <strong>Confirm the deployed bytecode matches the published source.</strong> Open the contract on
            Blockscout (linked above) and check the "Code" tab shows a green "Verified" badge, or run{" "}
            <code>forge verify-check</code> against the same address.
          </li>
          <li>
            <strong>Read the contract's own live state directly, bypassing this website entirely:</strong>
            <pre>{`cast call <CONTRACT> "started()(bool)" --rpc-url <RPC>\ncast call <CONTRACT> "isAlive()(bool)" --rpc-url <RPC>\ncast call <CONTRACT> "starter()(address)" --rpc-url <RPC>\ncast call <CONTRACT> "timerResetCount()(uint256)" --rpc-url <RPC>`}</pre>
          </li>
          <li>
            <strong>Confirm the rules themselves, not just this one deployment.</strong> The source is public. Clone
            the repository and run <code>forge test -vvv</code> to execute the full unit, fuzz, and stateful-invariant
            suite against the exact same bytecode that's deployed onchain.
          </li>
          <li>
            <strong>Reproduce the full onchain lifecycle locally, deterministically.</strong> Run{" "}
            <code>./scripts/demo.sh</code> from the repository root. It boots a real local chain, deploys the same
            contract, and proves the press → confirm → reject-a-second-press lifecycle end to end. This demonstrates
            the contract's own guarantees, which is what a wallet-based presser would have experienced before this
            pivot.
          </li>
        </ol>
      </section>
    </>
  );
}

function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 900 380"
      className={styles.diagram}
      role="img"
      aria-label="Architecture: a visitor's browser talks to a Vercel API, which reads and writes a Postgres database. That database is the source of truth for the actual game. Separately, an operator's browser with a connected wallet talks directly to Robinhood Chain and the ButtonExperiment contract for admin actions only; the two systems are independent."
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#555" />
        </marker>
      </defs>
      {[
        { x: 20, y: 40, w: 190, h: 70, label: "VISITOR'S BROWSER", sub: "no wallet needed" },
        { x: 350, y: 40, w: 190, h: 70, label: "VERCEL API", sub: "/api/press, /api/state…" },
        { x: 680, y: 40, w: 190, h: 70, label: "POSTGRES", sub: "source of truth for the game" },
        { x: 20, y: 220, w: 190, h: 70, label: "OPERATOR'S BROWSER", sub: "wallet connected, /admin only" },
        { x: 350, y: 220, w: 190, h: 70, label: "ROBINHOOD CHAIN", sub: "JSON-RPC" },
        { x: 680, y: 220, w: 190, h: 70, label: "BUTTONEXPERIMENT", sub: "real, but admin-only now" }
      ].map((box) => (
        <g key={box.label}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#0e0e0e" stroke="#333" />
          <text x={box.x + box.w / 2} y={box.y + box.h / 2 - 4} textAnchor="middle" fill="#e8e5de" fontSize="12" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {box.label}
          </text>
          <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 14} textAnchor="middle" fill="#77746e" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {box.sub}
          </text>
        </g>
      ))}
      <line x1="210" y1="75" x2="348" y2="75" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="540" y1="75" x2="678" y2="75" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="210" y1="255" x2="348" y2="255" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="540" y1="255" x2="678" y2="255" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <text x="450" y="345" textAnchor="middle" fill="#6f6c65" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        Two independent systems. The database is what regular visitors actually experience.
      </text>
    </svg>
  );
}
