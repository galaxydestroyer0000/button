import { runtimeConfig } from "../config/runtimeConfig";
import { addressUrl, txUrl } from "../config/network";
import { usePageMeta } from "../lib/pageMeta";
import type { ExperimentState } from "../domain/types";
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

export default function ProofPage({ state }: { state: ExperimentState }) {
  usePageMeta({
    title: "Proof",
    description: "The exact deployed contract, its verified source, current onchain state, and how to verify all of it yourself."
  });

  const statusLabel = runtimeConfig.previewMode
    ? "PREVIEW MODE — NO REAL DEPLOYMENT CONFIGURED"
    : !state.loaded
      ? "READING ONCHAIN STATE…"
      : !state.started
        ? "SEALED — NOT YET ACTIVATED"
        : state.alive
          ? "LIVE"
          : "ENDED — PERMANENT DEAD STATE";

  return (
    <>
      <section className={styles.section}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>PROOF</span>
          <h2>Verify everything yourself.</h2>
          <p className={styles.lede}>
            Nothing on this page is claimed on trust. Every fact below is either read live from the deployed contract,
            or a transaction hash you can independently look up on the block explorer. The "reproducible verification"
            section at the bottom gives you the exact commands to check all of it without this website at all.
          </p>
        </div>

        <div className={styles.facts}>
          <div>
            <span>STATUS</span>
            <code>{statusLabel}</code>
          </div>
          <div>
            <span>NETWORK</span>
            <code>{runtimeConfig.previewMode ? "—" : `${runtimeConfig.network.name.toUpperCase()} · CHAIN ${runtimeConfig.network.chainId}`}</code>
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
                "—"
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
            <code>{runtimeConfig.deployBlock !== null ? runtimeConfig.deployBlock.toString() : "—"}</code>
          </div>
          <TxFact label="ACTIVATION (start) TRANSACTION" hash={runtimeConfig.raw.startTx} />
          <div>
            <span>CURRENT BLOCK</span>
            <code>{runtimeConfig.previewMode ? "—" : state.currentBlock || "—"}</code>
          </div>
          <div>
            <span>TOTAL PRESSES</span>
            <code>{runtimeConfig.previewMode ? "—" : state.loaded ? state.totalPresses.toLocaleString() : "—"}</code>
          </div>
          <div>
            <span>EVENT HISTORY</span>
            <code>
              <a href="/history">VIEW ALL {state.loaded ? state.totalPresses.toLocaleString() : ""} PRESSES →</a>
            </code>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>What the contract guarantees — not the website</h2>
        </div>
        <div className={styles.explain}>
          <div>
            <h3>Faction and timing are derived onchain</h3>
            <p>
              A press's faction and its "remaining seconds" are computed entirely inside <code>press()</code> from{" "}
              <code>block.timestamp</code> at the moment the transaction executes — never from anything the browser
              sends. The frontend's countdown is a locally-interpolated display, corrected against the chain on every
              poll; it has no influence on the result. If this website disappeared entirely, the exact same faction
              and timing rules would still be enforced by the contract for anyone calling it directly.
            </p>
          </div>
          <div>
            <h3>$BUTTON cannot control the experiment</h3>
            <p>
              <code>ButtonExperiment</code> holds no reference to the BUTTON token contract, has no payable functions,
              and has no concept of balances or ownership. Holding, trading, or not holding BUTTON has zero effect on
              whether a wallet can press, when it presses, or what faction it lands in. The token is downstream of the
              experiment's identity system — a receipt — never an input to it.
            </p>
          </div>
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
          <h2>Reproducible verification</h2>
          <p className={styles.lede}>
            Run these yourself — with no dependency on this website, using only <code>cast</code> (part of{" "}
            <a href="https://book.getfoundry.sh/" target="_blank" rel="noopener noreferrer">
              Foundry
            </a>
            ) and the contract address above.
          </p>
        </div>
        <ol className={styles.steps}>
          <li>
            <strong>Confirm the deployed bytecode matches the published source.</strong> Open the contract on
            Blockscout (linked above) and check the "Code" tab shows a green "Verified" badge, or run{" "}
            <code>forge verify-check</code> against the same address.
          </li>
          <li>
            <strong>Read the live state directly, bypassing this website entirely:</strong>
            <pre>{`cast call <CONTRACT> "started()(bool)" --rpc-url <RPC>\ncast call <CONTRACT> "isAlive()(bool)" --rpc-url <RPC>\ncast call <CONTRACT> "totalPresses()(uint256)" --rpc-url <RPC>\ncast call <CONTRACT> "deadline()(uint256)" --rpc-url <RPC>`}</pre>
          </li>
          <li>
            <strong>Read the full press history as raw onchain events:</strong>
            <pre>{`cast logs --from-block <DEPLOY_BLOCK> --to-block latest --address <CONTRACT> \\\n  "Pressed(address,uint8,uint8,uint256,uint256)" --rpc-url <RPC>`}</pre>
          </li>
          <li>
            <strong>Confirm the rules themselves, not just this one deployment.</strong> The source is public — clone
            the repository and run <code>forge test -vvv</code> to execute the full unit, fuzz, and stateful-invariant
            suite against the exact same bytecode that's deployed onchain.
          </li>
          <li>
            <strong>Reproduce the full lifecycle locally, deterministically.</strong> Run{" "}
            <code>./scripts/demo.sh</code> from the repository root — it boots a real local chain, deploys the same
            contract, and proves the press → confirm → reject-a-second-press lifecycle end to end, with every value
            read back from the chain after the fact rather than assumed.
          </li>
        </ol>
      </section>
    </>
  );
}

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 900 330" className={styles.diagram} role="img" aria-label="Architecture: a browser talks directly to Robinhood Chain RPC and to the ButtonExperiment contract; there is no backend server. An IndexedDB cache in the browser stores indexed press events locally for the history and stats pages.">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#555" />
        </marker>
      </defs>
      {[
        { x: 20, y: 110, w: 190, h: 80, label: "BROWSER", sub: "React · wagmi · viem" },
        { x: 20, y: 20, w: 190, h: 60, label: "INJECTED WALLET", sub: "MetaMask / Robinhood Wallet" },
        { x: 350, y: 110, w: 190, h: 80, label: "ROBINHOOD CHAIN", sub: "JSON-RPC" },
        { x: 680, y: 110, w: 200, h: 80, label: "BUTTONEXPERIMENT", sub: "the deployed contract" },
        { x: 20, y: 220, w: 190, h: 60, label: "INDEXEDDB (LOCAL)", sub: "cached Pressed events" }
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
      <line x1="115" y1="80" x2="115" y2="108" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="210" y1="150" x2="348" y2="150" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="540" y1="150" x2="678" y2="150" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="115" y1="190" x2="115" y2="218" stroke="#555" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <text x="450" y="315" textAnchor="middle" fill="#6f6c65" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        No backend. No database of record. The contract is the only source of truth.
      </text>
    </svg>
  );
}
