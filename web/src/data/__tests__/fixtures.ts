import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";
import { buttonExperimentAbi } from "../../abi/buttonExperiment";

const PRESSED_EVENT = buttonExperimentAbi.find((item) => item.type === "event" && item.name === "Pressed")!;

/** Builds a raw log exactly shaped like what publicClient.getLogs would return for a
 *  real `Pressed` event — encoded and decodable through the real ABI, not a stub. */
export function fakePressedLog(params: {
  presser: `0x${string}`;
  remaining: number;
  faction: number;
  timestamp: number;
  pressNumber: number;
  blockNumber: bigint;
  logIndex: number;
  txHash?: `0x${string}`;
}): Log {
  const topics = encodeEventTopics({
    abi: [PRESSED_EVENT],
    eventName: "Pressed",
    args: { presser: params.presser }
  });
  const data = encodeAbiParameters(
    [{ type: "uint8" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" }],
    [params.remaining, params.faction, BigInt(params.timestamp), BigInt(params.pressNumber)]
  );
  return {
    address: "0x000000000000000000000000000000000B0770",
    topics,
    data,
    blockNumber: params.blockNumber,
    blockHash: `0xblock${params.blockNumber}` as `0x${string}`,
    logIndex: params.logIndex,
    transactionHash: params.txHash ?? (`0xtx${params.blockNumber}-${params.logIndex}` as `0x${string}`),
    transactionIndex: 0,
    removed: false
  } as unknown as Log;
}
