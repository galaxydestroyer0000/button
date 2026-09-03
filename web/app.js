const CONFIG = window.BUTTON_CONFIG || {};

const NETWORKS = {
  mainnet: {
    name: "Robinhood Chain",
    short: "MAINNET",
    chainId: 4663,
    chainHex: "0x1237",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com"
  },
  testnet: {
    name: "Robinhood Chain Testnet",
    short: "TESTNET",
    chainId: 46630,
    chainHex: "0xb626",
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com"
  }
};

const net = NETWORKS[CONFIG.network] || NETWORKS.testnet;
const contract = String(CONFIG.contractAddress || "").trim();
const liveConfigured = /^0x[a-fA-F0-9]{40}$/.test(contract) && !/^0x0{40}$/i.test(contract);
const previewMode = !liveConfigured;
const ethereum = window.ethereum;

const FACTIONS = {
  0: { name: "GREY", range: "NEVER PRESSED", color: "#858585" },
  1: { name: "PURPLE", range: "52–60s", color: "#8b5cf6" },
  2: { name: "BLUE", range: "42–51s", color: "#3b82f6" },
  3: { name: "GREEN", range: "32–41s", color: "#22c55e" },
  4: { name: "YELLOW", range: "22–31s", color: "#f4d03f" },
  5: { name: "ORANGE", range: "12–21s", color: "#f97316" },
  6: { name: "RED", range: "0–11s", color: "#ef4444" }
};

const $ = (id) => document.getElementById(id);
const els = {
  previewBanner: $("preview-banner"),
  networkPill: $("network-pill"),
  soundBtn: $("sound-btn"),
  walletBtn: $("wallet-btn"),
  statusDot: $("status-dot"),
  experimentStatus: $("experiment-status"),
  timer: $("timer"),
  deadlineLabel: $("deadline-label"),
  pressBtn: $("press-btn"),
  identity: $("identity-line"),
  txStatus: $("tx-status"),
  postPress: $("post-press"),
  tape: $("live-tape"),
  tapeFreshness: $("tape-freshness"),
  statTotal: $("stat-total"),
  statAge: $("stat-age"),
  statClosest: $("stat-closest"),
  statLatest: $("stat-latest"),
  factionList: $("faction-list"),
  tokenLink: $("token-link"),
  proofNetwork: $("proof-network"),
  proofChain: $("proof-chain"),
  proofContract: $("proof-contract"),
  proofBlock: $("proof-block"),
  proofCurrent: $("proof-current"),
  proofRpc: $("proof-rpc"),
  explorerLink: $("explorer-link")
};

let account = "";
let walletChainId = null;
let chainOffsetMs = 0;
let latestEventKey = "";
let tape = [];
let state = {
  loaded: false,
  stale: false,
  started: false,
  alive: false,
  startedAt: 0,
  deadline: 0,
  totalPresses: 0,
  closestCall: 0,
  factions: [0,0,0,0,0,0,0],
  currentBlock: 0
};
let userState = { loaded: false, hasPressed: false, faction: 0, remaining: 0, txHash: "" };

const preview = {
  startedAtMs: Date.now(),
  deadlineMs: Date.now() + 60_000,
  pressed: false,
  faction: 0,
  remaining: 0,
  total: 0,
  closest: 0,
  factions: [0,0,0,0,0,0,0],
  ended: false,
  tape: []
};

const KNOWN_SELECTORS = {
  "started()": "0x1f2698ab",
  "startedAt()": "0xf21f537d",
  "deadline()": "0x29dcb0cf",
  "totalPresses()": "0x2741876a",
  "closestCall()": "0xfe16747e",
  "isAlive()": "0x4136aa35",
  "factionCounts(uint256)": "0x0204bb3b",
  "hasPressed(address)": "0xd6e3b89a",
  "pressFaction(address)": "0xb8a49939",
  "pressRemaining(address)": "0x230017db",
  "press()": "0x5b372532"
};
const selectorCache = new Map(Object.entries(KNOWN_SELECTORS));
let eventTopic = "0xc70715c862905f6e496ebe8652475caec045114319fc50f52707ab6314c94460";
let soundEnabled = false;
let lastTickSecond = null;
let audioCtx = null;


function playTone(freq = 560, duration = 0.035, gain = 0.025) {
  if (!soundEnabled) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    g.gain.value = gain;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {}
}

function shortAddress(value) {
  if (!value || value.length < 10) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function hexToBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

function pad64(hexNoPrefix) {
  return hexNoPrefix.toLowerCase().padStart(64, "0");
}

function encodeUint(value) {
  return pad64(BigInt(value).toString(16));
}

function encodeAddress(value) {
  return pad64(value.replace(/^0x/, ""));
}

function textHex(text) {
  return "0x" + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function rpc(method, params = []) {
  const response = await fetch(net.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method, params })
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC error");
  return payload.result;
}

async function selector(signature) {
  if (selectorCache.has(signature)) return selectorCache.get(signature);
  const hash = await rpc("web3_sha3", [textHex(signature)]);
  const value = hash.slice(0, 10);
  selectorCache.set(signature, value);
  return value;
}

async function callRaw(signature, encodedArgs = "") {
  const data = (await selector(signature)) + encodedArgs;
  return rpc("eth_call", [{ to: contract, data }, "latest"]);
}

async function callUint(signature, encodedArgs = "") {
  return Number(hexToBigInt(await callRaw(signature, encodedArgs)));
}

async function callBool(signature, encodedArgs = "") {
  return hexToBigInt(await callRaw(signature, encodedArgs)) !== 0n;
}

async function buildEventTopic() { return eventTopic; }

function factionForRemaining(remaining) {
  if (remaining >= 52) return 1;
  if (remaining >= 42) return 2;
  if (remaining >= 32) return 3;
  if (remaining >= 22) return 4;
  if (remaining >= 12) return 5;
  return 6;
}

function nowChainMs() {
  return Date.now() + chainOffsetMs;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function relativeTime(timestamp) {
  const diff = Math.max(0, Math.floor((nowChainMs() / 1000) - timestamp));
  if (diff < 5) return "NOW";
  if (diff < 60) return `${diff}s AGO`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m AGO`;
  return `${Math.floor(diff / 3600)}h AGO`;
}

function txUrl(hash) { return `${net.explorer}/tx/${hash}`; }
function addressUrl(addr) { return `${net.explorer}/address/${addr}`; }

function renderFactionList(counts, total) {
  els.factionList.innerHTML = [1,2,3,4,5,6].map((i) => {
    const f = FACTIONS[i];
    const count = Number(counts[i] || 0);
    const pct = total ? (count / total) * 100 : 0;
    return `<div class="faction-row" style="--fc:${f.color}">
      <span class="faction-swatch"></span>
      <span class="faction-name">${f.name}</span>
      <span class="faction-range">${f.range}</span>
      <span class="faction-bar" aria-label="${f.name} ${pct.toFixed(1)} percent"><i style="--pct:${pct.toFixed(2)}%"></i></span>
      <span class="faction-count">${count} · ${pct.toFixed(1)}%</span>
    </div>`;
  }).join("");
}

function renderTape() {
  if (!tape.length) {
    els.tape.innerHTML = `<div class="empty">No presses indexed yet.</div>`;
    els.statLatest.textContent = "—";
    return;
  }
  els.statLatest.textContent = shortAddress(tape[0].presser);
  els.tape.innerHTML = tape.slice(0, 14).map((e, idx) => {
    const f = FACTIONS[e.faction] || FACTIONS[0];
    return `<div class="tape-row ${idx === 0 && e.key === latestEventKey ? "flash" : ""}">
      <span class="no">#${e.pressNumber}</span>
      <span class="wallet">${shortAddress(e.presser)}</span>
      <span class="seconds">${e.remaining}s</span>
      <span class="faction-chip" style="--chip:${f.color}">${f.name}</span>
      <span class="ago">${relativeTime(e.timestamp)}</span>
      ${e.txHash ? `<a href="${txUrl(e.txHash)}" target="_blank" rel="noopener noreferrer" aria-label="View press transaction">↗</a>` : `<span></span>`}
    </div>`;
  }).join("");
}

function renderPostPress(faction, remaining, txHash = "") {
  const f = FACTIONS[faction] || FACTIONS[0];
  const share = `I pressed BUTTON at ${remaining} seconds. ${f.name}. One press forever. $BUTTON / RDDT`;
  els.postPress.classList.remove("hidden");
  els.postPress.innerHTML = `
    <strong style="color:${f.color}">YOU PRESSED AT ${String(remaining).padStart(2,"0")}s — ${f.name}</strong>
    ${txHash ? `<a href="${txUrl(txHash)}" target="_blank" rel="noopener noreferrer">TX ↗</a>` : ""}
    <button type="button" id="copy-share">COPY</button>
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}" target="_blank" rel="noopener noreferrer">SHARE ON X ↗</a>`;
  $("copy-share")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(share).catch(() => {});
    $("copy-share").textContent = "COPIED";
  });
}

function setPressButton(label, disabled) {
  els.pressBtn.disabled = disabled;
  const copy = els.pressBtn.querySelector(".button-copy");
  if (copy) copy.textContent = label;
}

function renderIdentity() {
  if (previewMode) {
    if (preview.pressed) {
      const f = FACTIONS[preview.faction];
      els.identity.textContent = `YOU ARE ${f.name} · YOUR ONE PRESS IS SPENT`;
      els.identity.style.color = f.color;
      renderPostPress(preview.faction, preview.remaining);
    } else {
      els.identity.textContent = "YOU ARE GREY · YOU HAVE NOT PRESSED";
      els.identity.style.color = FACTIONS[0].color;
      els.postPress.classList.add("hidden");
    }
    return;
  }

  if (!account) {
    els.identity.textContent = "CONNECT A WALLET TO REVEAL YOUR STATUS";
    els.identity.style.color = "";
    els.postPress.classList.add("hidden");
    return;
  }
  if (!userState.loaded) {
    els.identity.textContent = "READING YOUR ONCHAIN STATUS…";
    els.identity.style.color = "";
    return;
  }
  if (userState.hasPressed) {
    const f = FACTIONS[userState.faction];
    els.identity.textContent = `YOU ARE ${f.name} · YOUR ONE PRESS IS SPENT`;
    els.identity.style.color = f.color;
    renderPostPress(userState.faction, userState.remaining, userState.txHash);
  } else {
    els.identity.textContent = "YOU ARE GREY · YOU HAVE NOT PRESSED";
    els.identity.style.color = FACTIONS[0].color;
    els.postPress.classList.add("hidden");
  }
}

function renderCore() {
  els.networkPill.textContent = `ROBINHOOD · ${previewMode ? "PREVIEW" : net.short}`;
  els.proofNetwork.textContent = previewMode ? "PREVIEW / LOCAL" : net.name.toUpperCase();
  els.proofChain.textContent = previewMode ? "—" : String(net.chainId);
  els.proofContract.textContent = previewMode ? "NOT CONFIGURED" : contract;
  els.proofBlock.textContent = CONFIG.contractDeployBlock || "—";
  els.proofCurrent.textContent = previewMode ? "—" : (state.currentBlock || "—");

  if (previewMode) {
    els.previewBanner.classList.remove("hidden");
    els.proofRpc.textContent = "PREVIEW ONLY";
    els.experimentStatus.textContent = preview.ended ? "PREVIEW ENDED · NOT ONCHAIN" : "PREVIEW CLOCK RUNNING · NOT ONCHAIN";
    els.statusDot.className = `status-dot ${preview.ended ? "dead" : "stale"}`;
    els.deadlineLabel.textContent = preview.ended ? "LOCAL PREVIEW HAS EXPIRED" : "LOCAL DEMO · NO BLOCKCHAIN STATE";
    els.statTotal.textContent = String(preview.total);
    els.statAge.textContent = formatDuration((Math.min(Date.now(), preview.deadlineMs) - preview.startedAtMs) / 1000);
    els.statClosest.textContent = preview.total ? `${preview.closest}s` : "—";
    tape = preview.tape;
    renderTape();
    renderFactionList(preview.factions, preview.total);
    setPressButton(preview.ended ? "ENDED" : (preview.pressed ? "SPENT" : "PRESS"), preview.ended || preview.pressed);
    renderIdentity();
    return;
  }

  els.previewBanner.classList.add("hidden");
  els.proofRpc.textContent = state.stale ? "STALE" : (state.loaded ? "CONNECTED" : "CHECKING");
  els.proofRpc.style.color = state.stale ? "#f4d03f" : "";
  els.explorerLink.href = addressUrl(contract);
  els.explorerLink.classList.remove("hidden");

  if (!state.loaded) {
    els.experimentStatus.textContent = "LOADING SHARED STATE";
    els.statusDot.className = "status-dot";
    setPressButton("WAIT", true);
    return;
  }

  if (state.stale) {
    els.experimentStatus.textContent = "RPC STALE · SHOWING LAST KNOWN STATE";
    els.statusDot.className = "status-dot stale";
  } else if (!state.started) {
    els.experimentStatus.textContent = "THE BUTTON IS SEALED";
    els.statusDot.className = "status-dot";
  } else if (state.alive) {
    els.experimentStatus.textContent = "EXPERIMENT LIVE · SHARED CLOCK RUNNING";
    els.statusDot.className = "status-dot live";
  } else {
    els.experimentStatus.textContent = "EXPERIMENT ENDED · HISTORY FROZEN";
    els.statusDot.className = "status-dot dead";
  }

  if (!state.started) els.deadlineLabel.textContent = "AWAITING ONE-TIME ACTIVATION";
  else if (state.alive) els.deadlineLabel.textContent = `DEADLINE · ${new Date(state.deadline * 1000).toLocaleTimeString([], { hour12: false })}`;
  else els.deadlineLabel.textContent = `ENDED · ${new Date(state.deadline * 1000).toLocaleString()}`;

  els.statTotal.textContent = state.totalPresses.toLocaleString();
  const ageEnd = state.alive ? nowChainMs()/1000 : state.deadline;
  els.statAge.textContent = state.started ? formatDuration(Math.max(0, ageEnd - state.startedAt)) : "—";
  els.statClosest.textContent = state.totalPresses ? `${state.closestCall}s` : "—";
  renderFactionList(state.factions, state.totalPresses);
  renderTape();

  const already = account && userState.loaded && userState.hasPressed;
  const wrong = account && walletChainId !== net.chainId;
  if (!state.started) setPressButton("SEALED", true);
  else if (!state.alive) setPressButton("ENDED", true);
  else if (already) setPressButton("SPENT", true);
  else if (state.stale) setPressButton("STALE", true);
  else setPressButton(wrong ? "SWITCH" : "PRESS", false);
  renderIdentity();
}

async function readUserState() {
  if (previewMode || !account) {
    userState = { loaded: false, hasPressed: false, faction: 0, remaining: 0, txHash: "" };
    renderIdentity();
    return;
  }
  try {
    const arg = encodeAddress(account);
    const [has, faction, remaining] = await Promise.all([
      callBool("hasPressed(address)", arg),
      callUint("pressFaction(address)", arg),
      callUint("pressRemaining(address)", arg)
    ]);
    userState = { ...userState, loaded: true, hasPressed: has, faction, remaining };
  } catch (error) {
    console.warn("User-state read failed", error);
    userState.loaded = false;
  }
  renderCore();
}

async function refreshCore() {
  if (previewMode) return;
  try {
    const code = await rpc("eth_getCode", [contract, "latest"]);
    if (!code || code === "0x") throw new Error("No contract code at configured address");

    const [block, started, startedAt, deadline, totalPresses, closestCall, alive, ...counts] = await Promise.all([
      rpc("eth_getBlockByNumber", ["latest", false]),
      callBool("started()"),
      callUint("startedAt()"),
      callUint("deadline()"),
      callUint("totalPresses()"),
      callUint("closestCall()"),
      callBool("isAlive()"),
      ...[1,2,3,4,5,6].map(i => callUint("factionCounts(uint256)", encodeUint(i)))
    ]);

    const blockTimeMs = Number(hexToBigInt(block.timestamp)) * 1000;
    chainOffsetMs = blockTimeMs - Date.now();
    state = {
      loaded: true,
      stale: false,
      started,
      alive,
      startedAt,
      deadline,
      totalPresses,
      closestCall,
      factions: [0, ...counts],
      currentBlock: Number(hexToBigInt(block.number))
    };
    renderCore();
    if (account) await readUserState();
  } catch (error) {
    console.warn("Core state refresh failed", error);
    state.stale = state.loaded;
    els.txStatus.textContent = state.loaded ? "RPC DEGRADED · LAST KNOWN STATE PRESERVED" : `RPC ERROR · ${error.message}`;
    renderCore();
  }
}

function decodeLog(log) {
  const data = (log.data || "0x").slice(2);
  const word = (i) => data.slice(i * 64, (i + 1) * 64) || "0";
  const presser = `0x${(log.topics?.[1] || "").slice(-40)}`;
  return {
    key: `${log.transactionHash}:${log.logIndex}`,
    txHash: log.transactionHash,
    presser,
    remaining: Number(BigInt(`0x${word(0)}`)),
    faction: Number(BigInt(`0x${word(1)}`)),
    timestamp: Number(BigInt(`0x${word(2)}`)),
    pressNumber: Number(BigInt(`0x${word(3)}`)),
    blockNumber: Number(hexToBigInt(log.blockNumber)),
    logIndex: Number(hexToBigInt(log.logIndex))
  };
}

async function refreshLogs() {
  if (previewMode || !state.loaded) return;
  try {
    const topic = await buildEventTopic();
    let from = CONFIG.contractDeployBlock ? Number(CONFIG.contractDeployBlock) : Math.max(0, state.currentBlock - 20_000);
    let logs;
    try {
      logs = await rpc("eth_getLogs", [{ address: contract, fromBlock: `0x${from.toString(16)}`, toBlock: "latest", topics: [topic] }]);
    } catch {
      from = Math.max(0, state.currentBlock - 5_000);
      logs = await rpc("eth_getLogs", [{ address: contract, fromBlock: `0x${from.toString(16)}`, toBlock: "latest", topics: [topic] }]);
    }
    const decoded = logs.map(decodeLog).sort((a,b) => (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex));
    const nextKey = decoded[0]?.key || "";
    if (latestEventKey && nextKey && nextKey !== latestEventKey) {
      playTone(920, 0.07, 0.035);
      els.timer.animate([{ transform: "scale(1.035)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    }
    latestEventKey = nextKey;
    tape = decoded.slice(0, 25);
    els.tapeFreshness.textContent = "LIVE · ONCHAIN";
    renderTape();
  } catch (error) {
    console.warn("Log refresh failed", error);
    els.tapeFreshness.textContent = "TAPE STALE";
  }
}

function updateTimer() {
  let remainingMs = 0;
  let active = false;
  let sealed = false;

  if (previewMode) {
    remainingMs = preview.deadlineMs - Date.now();
    active = !preview.ended;
    if (remainingMs <= 0 && !preview.ended) {
      preview.ended = true;
      remainingMs = 0;
      renderCore();
    }
  } else if (state.loaded) {
    sealed = !state.started;
    active = state.started && state.alive;
    remainingMs = state.deadline * 1000 - nowChainMs();
    if (remainingMs <= 0 && state.started) remainingMs = 0;
  }

  if (sealed || (!state.loaded && !previewMode)) {
    els.timer.textContent = "00:--";
    els.timer.classList.remove("urgent", "critical");
    document.body.classList.remove("warning");
    requestAnimationFrame(updateTimer);
    return;
  }

  remainingMs = Math.max(0, remainingMs);
  const secondsWhole = Math.floor(remainingMs / 1000);
  const hundredths = Math.floor((remainingMs % 1000) / 10);
  els.timer.textContent = `00:${String(secondsWhole).padStart(2,"0")}.${String(hundredths).padStart(2,"0")}`;
  const remainingSec = remainingMs / 1000;
  if (active && remainingSec <= 12 && secondsWhole !== lastTickSecond) {
    lastTickSecond = secondsWhole;
    playTone(remainingSec <= 5 ? 780 : 520, 0.028, remainingSec <= 5 ? 0.035 : 0.018);
  }
  if (!active || remainingSec > 12) lastTickSecond = null;
  els.timer.classList.toggle("urgent", active && remainingSec <= 12);
  els.timer.classList.toggle("critical", active && remainingSec <= 5);
  document.body.classList.toggle("warning", active && remainingSec <= 12);
  requestAnimationFrame(updateTimer);
}

async function getWalletChain() {
  if (!ethereum) return null;
  const hex = await ethereum.request({ method: "eth_chainId" });
  return Number(BigInt(hex));
}

async function switchNetwork() {
  if (!ethereum) throw new Error("No injected EVM wallet detected");
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: net.chainHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: net.chainHex,
        chainName: net.name,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [net.rpc],
        blockExplorerUrls: [net.explorer]
      }]
    });
  }
  walletChainId = await getWalletChain();
  renderCore();
}

async function connectWallet() {
  if (previewMode) {
    els.txStatus.textContent = "PREVIEW MODE DOES NOT USE YOUR WALLET";
    return;
  }
  if (!ethereum) {
    els.txStatus.textContent = "NO INJECTED EVM WALLET · OPEN IN ROBINHOOD WALLET OR METAMASK BROWSER";
    return;
  }
  try {
    els.txStatus.textContent = "AWAITING WALLET CONNECTION…";
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    account = accounts?.[0] || "";
    walletChainId = await getWalletChain();
    els.walletBtn.textContent = account ? shortAddress(account) : "CONNECT WALLET";
    els.txStatus.textContent = "";
    await readUserState();
    renderCore();
  } catch (error) {
    els.txStatus.textContent = error?.code === 4001 ? "CONNECTION REJECTED · NOTHING CHANGED" : `WALLET ERROR · ${error.message || "UNKNOWN"}`;
  }
}

async function waitForReceipt(hash, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise(r => setTimeout(r, 900));
  }
  throw new Error("Confirmation timed out. Check the transaction on Blockscout.");
}

function previewPress() {
  if (preview.pressed || preview.ended) return;
  const left = Math.max(1, Math.min(60, Math.ceil((preview.deadlineMs - Date.now()) / 1000)));
  const faction = factionForRemaining(left);
  preview.pressed = true;
  preview.faction = faction;
  preview.remaining = left;
  preview.total += 1;
  preview.closest = left;
  preview.factions[faction] += 1;
  preview.deadlineMs = Date.now() + 60_000;
  preview.tape.unshift({
    key: `preview-${Date.now()}`,
    txHash: "",
    presser: "0x00000000000000000000000000000000PREVIEW",
    remaining: left,
    faction,
    timestamp: Math.floor(Date.now()/1000),
    pressNumber: preview.total
  });
  latestEventKey = preview.tape[0].key;
  els.txStatus.textContent = "PREVIEW PRESS RECORDED LOCALLY · NO TRANSACTION WAS SENT";
  renderCore();
}

async function press() {
  if (previewMode) {
    previewPress();
    return;
  }
  if (!state.started || !state.alive || state.stale) return;
  if (!account) {
    await connectWallet();
    return;
  }
  if (userState.hasPressed) return;

  try {
    if (walletChainId !== net.chainId) {
      els.txStatus.textContent = `SWITCHING TO ${net.name.toUpperCase()}…`;
      await switchNetwork();
      return;
    }
    const data = await selector("press()");
    els.txStatus.textContent = "AWAITING YOUR ONE IRREVERSIBLE PRESS IN WALLET…";
    const hash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: contract, data }] });
    userState.txHash = hash;
    els.txStatus.innerHTML = `SUBMITTED · <a href="${txUrl(hash)}" target="_blank" rel="noopener noreferrer">VIEW TX ↗</a> · CONFIRMING…`;
    setPressButton("PENDING", true);
    const receipt = await waitForReceipt(hash);
    if (receipt.status !== "0x1") throw new Error("Transaction reverted. The clock may have expired or your wallet had already pressed.");
    els.txStatus.textContent = "CONFIRMED ON ROBINHOOD CHAIN · YOUR PRESS IS PERMANENT";
    await refreshCore();
    await refreshLogs();
    await readUserState();
  } catch (error) {
    const rejected = error?.code === 4001;
    els.txStatus.textContent = rejected
      ? "PRESS REJECTED IN WALLET · YOUR ONE PRESS IS STILL UNUSED"
      : `PRESS FAILED · ${error.message || "STATE CHANGED BEFORE CONFIRMATION"}`;
    await refreshCore();
    await readUserState();
  }
}

function initStatic() {
  els.networkPill.textContent = `ROBINHOOD · ${previewMode ? "PREVIEW" : net.short}`;
  els.proofNetwork.textContent = previewMode ? "PREVIEW / LOCAL" : net.name.toUpperCase();
  els.proofChain.textContent = previewMode ? "—" : String(net.chainId);
  els.proofContract.textContent = previewMode ? "NOT CONFIGURED" : contract;
  els.proofBlock.textContent = CONFIG.contractDeployBlock || "—";
  if (CONFIG.tokenUrl) {
    els.tokenLink.href = CONFIG.tokenUrl;
    els.tokenLink.classList.remove("hidden");
  }
  renderFactionList([0,0,0,0,0,0,0], 0);
}

els.soundBtn?.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  els.soundBtn.setAttribute("aria-pressed", String(soundEnabled));
  els.soundBtn.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  if (soundEnabled) playTone(640, 0.045, 0.02);
});

els.walletBtn.addEventListener("click", connectWallet);
els.networkPill.addEventListener("click", () => !previewMode && switchNetwork().catch(e => { els.txStatus.textContent = `NETWORK SWITCH FAILED · ${e.message}`; }));
els.pressBtn.addEventListener("click", press);

if (ethereum && !previewMode) {
  ethereum.on?.("accountsChanged", async (accounts) => {
    account = accounts?.[0] || "";
    els.walletBtn.textContent = account ? shortAddress(account) : "CONNECT WALLET";
    await readUserState();
    renderCore();
  });
  ethereum.on?.("chainChanged", async () => {
    walletChainId = await getWalletChain().catch(() => null);
    renderCore();
  });
}

async function boot() {
  initStatic();
  updateTimer();
  if (previewMode) {
    renderCore();
    return;
  }
  if (ethereum) {
    const accounts = await ethereum.request({ method: "eth_accounts" }).catch(() => []);
    account = accounts?.[0] || "";
    walletChainId = await getWalletChain().catch(() => null);
    els.walletBtn.textContent = account ? shortAddress(account) : "CONNECT WALLET";
  }
  await refreshCore();
  await refreshLogs();
  if (account) await readUserState();
  setInterval(refreshCore, 2500);
  setInterval(refreshLogs, 5000);
  setInterval(renderTape, 1000);
}

boot();
