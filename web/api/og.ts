import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPublicClient, http, type AbiEvent } from "viem";
import { buttonExperimentAbi } from "../src/abi/buttonExperiment.js";
import { NETWORKS } from "../src/config/network.js";
import { FACTIONS } from "../src/domain/factions.js";

/**
 * Serves real, per-press or per-wallet OpenGraph tags to crawlers that fetch a
 * /press/[number] or /wallet/[address] URL without executing JavaScript (Twitter,
 * Discord, iMessage, Slack) — see web/vercel.json's `rewrites`, which routes ONLY
 * requests carrying a known crawler user-agent to this function; a normal browser
 * still gets the regular SPA. Configuration comes from the same env vars
 * scripts/configure.mjs already reads (VITE_RH_NETWORK, VITE_BUTTON_CONTRACT,
 * VITE_CONTRACT_DEPLOY_BLOCK, VITE_RH_RPC_URL) — this function is stateless and
 * reads live from the chain on every cold cache, never a database.
 *
 * Honesty about its limits: the wallet lookup is a direct, cheap contract read.
 * The press-number lookup is NOT — the contract has no reverse
 * press-number-to-wallet mapping, so this scans Pressed events from the deployment
 * block forward in bounded chunks, same as the client's own sync. That's fine at
 * this experiment's realistic scale (bounded by one press per wallet and a real
 * end), and responses are cached at the edge (see Cache-Control below) so repeated
 * crawler hits for the same press don't rescan — but if this ever needs to survive
 * a much larger history than expected, the fix is adding a
 * `mapping(uint256 => address) public presserByPressNumber` to the contract, not
 * scaling this function further.
 */

const SCAN_CHUNK_BLOCKS = 5_000n;
const FALLBACK_IMAGE = "/assets/button-token.webp";

function html(title: string, description: string, url: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escape(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BUTTON / RDDT" />
  <meta property="og:title" content="${escape(title)}" />
  <meta property="og:description" content="${escape(description)}" />
  <meta property="og:image" content="${escape(FALLBACK_IMAGE)}" />
  <meta property="og:url" content="${escape(url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escape(title)}" />
  <meta name="twitter:description" content="${escape(description)}" />
  <meta name="twitter:image" content="${escape(FALLBACK_IMAGE)}" />
  <meta http-equiv="refresh" content="0; url=${escape(url)}" />
</head>
<body></body>
</html>`;
}

function getRuntimeConfig() {
  const networkKey = (process.env.VITE_RH_NETWORK === "mainnet" ? "mainnet" : "testnet") as "mainnet" | "testnet";
  const network = NETWORKS[networkKey];
  const contractAddress = (process.env.VITE_BUTTON_CONTRACT || "") as `0x${string}`;
  const deployBlock = process.env.VITE_CONTRACT_DEPLOY_BLOCK ? BigInt(process.env.VITE_CONTRACT_DEPLOY_BLOCK) : 0n;
  const rpcUrl = process.env.VITE_RH_RPC_URL || network.rpc;
  return { network, contractAddress, deployBlock, rpcUrl };
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { type, number, address } = req.query;
  const { network, contractAddress, deployBlock, rpcUrl } = getRuntimeConfig();
  const requestUrl = `https://${req.headers.host}${req.url ?? ""}`;

  if (!contractAddress) {
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html("BUTTON / RDDT", "The experiment is not yet configured.", requestUrl));
    return;
  }

  const client = createPublicClient({ chain: network.chain, transport: http(rpcUrl) });

  try {
    if (type === "wallet" && typeof address === "string") {
      const [hasPressed, faction, remaining] = await Promise.all([
        client.readContract({ address: contractAddress, abi: buttonExperimentAbi, functionName: "hasPressed", args: [address as `0x${string}`] }),
        client.readContract({ address: contractAddress, abi: buttonExperimentAbi, functionName: "pressFaction", args: [address as `0x${string}`] }),
        client.readContract({ address: contractAddress, abi: buttonExperimentAbi, functionName: "pressRemaining", args: [address as `0x${string}`] })
      ]);

      const title = hasPressed ? `${shortAddress(address)} — ${FACTIONS[Number(faction)]?.name}` : `${shortAddress(address)} — hasn't pressed`;
      const description = hasPressed
        ? `${shortAddress(address)} pressed BUTTON at ${remaining} seconds. ${FACTIONS[Number(faction)]?.name}. One press forever.`
        : "This wallet's one press is still unspent.";

      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
      res.send(html(title, description, requestUrl));
      return;
    }

    if (type === "press" && typeof number === "string") {
      const pressNumber = Number(number);
      const latestBlock = await client.getBlockNumber();
      const pressedEvent = buttonExperimentAbi.find((item) => item.type === "event" && item.name === "Pressed") as AbiEvent;

      let found: { presser: `0x${string}`; remaining: number; faction: number } | null = null;
      let cursor = deployBlock;
      while (cursor <= latestBlock && !found) {
        const to = cursor + SCAN_CHUNK_BLOCKS - 1n > latestBlock ? latestBlock : cursor + SCAN_CHUNK_BLOCKS - 1n;
        const logs = await client.getLogs({ address: contractAddress, event: pressedEvent, fromBlock: cursor, toBlock: to });
        for (const log of logs) {
          const args = (log as unknown as { args: { presser: `0x${string}`; remaining: number; faction: number; pressNumber: bigint } }).args;
          if (Number(args.pressNumber) === pressNumber) {
            found = { presser: args.presser, remaining: Number(args.remaining), faction: Number(args.faction) };
            break;
          }
        }
        cursor = to + 1n;
      }

      const title = found
        ? `Press #${pressNumber.toLocaleString()} — ${FACTIONS[found.faction]?.name}, ${found.remaining}s`
        : `Press #${pressNumber.toLocaleString()}`;
      const description = found
        ? `${shortAddress(found.presser)} pressed BUTTON at ${found.remaining} seconds. ${FACTIONS[found.faction]?.name}. One press forever.`
        : "This press number hasn't happened (yet, or ever).";

      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", found ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=30");
      res.send(html(title, description, requestUrl));
      return;
    }

    res.status(400).send("Missing or invalid type/number/address");
  } catch (error) {
    console.error("OG generation failed", error);
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html("BUTTON / RDDT", "One wallet, one press, forever.", requestUrl));
  }
}
