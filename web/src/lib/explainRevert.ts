import { BaseError, ContractFunctionRevertedError, type PublicClient } from "viem";
import { buttonExperimentAbi } from "../abi/buttonExperiment";

/// Replays a failed transaction as a simulated call at the exact block it was mined
/// in, so the contract's own custom error tells us the authoritative reason — never
/// a guess. Shared by every UI surface that submits a write to ButtonExperiment
/// (press, start, resetTimer), so a hostile/unlucky timing mismatch is explained
/// identically everywhere instead of duplicating the same simulate-and-decode logic.
export async function explainRevert(params: {
  publicClient: PublicClient | undefined;
  contractAddress: `0x${string}`;
  functionName: "press" | "start" | "resetTimer";
  account: `0x${string}`;
  blockNumber: bigint;
  reasonMessages: Record<string, string>;
}): Promise<string> {
  const { publicClient, contractAddress, functionName, account, blockNumber, reasonMessages } = params;
  if (!publicClient) return "TRANSACTION REVERTED · COULD NOT DETERMINE THE EXACT REASON";
  try {
    await publicClient.simulateContract({
      address: contractAddress,
      abi: buttonExperimentAbi,
      functionName,
      account,
      blockNumber
    });
    return "TRANSACTION REVERTED FOR AN UNKNOWN REASON";
  } catch (error) {
    if (error instanceof BaseError) {
      const revertError = error.walk((e) => e instanceof ContractFunctionRevertedError);
      if (revertError instanceof ContractFunctionRevertedError) {
        const errorName = revertError.data?.errorName ?? "";
        return reasonMessages[errorName] ?? (errorName ? `TRANSACTION REVERTED · ${errorName}` : "TRANSACTION REVERTED");
      }
    }
    return "TRANSACTION REVERTED · COULD NOT DETERMINE THE EXACT REASON";
  }
}
