import { describe, expect, it } from "vitest";
import { computeRuntimeConfig } from "../computeRuntimeConfig";

const BASE: ButtonConfig = {
  network: "testnet",
  contractAddress: "",
  contractDeployBlock: "",
  tokenAddress: "",
  tokenUrl: "",
  pairLabel: "BUTTON / RDDT",
  rpcUrl: "",
  deployTx: "",
  startTx: ""
};

describe("computeRuntimeConfig — network resolution", () => {
  it("resolves testnet, mainnet, and local to their own chain configs", () => {
    expect(computeRuntimeConfig({ ...BASE, network: "testnet" }).network.chainId).toBe(46630);
    expect(computeRuntimeConfig({ ...BASE, network: "mainnet" }).network.chainId).toBe(4663);
    expect(computeRuntimeConfig({ ...BASE, network: "local" }).network.chainId).toBe(31337);
  });

  it("falls back to testnet for an unknown/malformed network string rather than throwing", () => {
    const config = computeRuntimeConfig({ ...BASE, network: "<script>alert(1)</script>" });
    expect(config.network.chainId).toBe(46630);
  });
});

describe("computeRuntimeConfig — contract address handling (preview mode gate)", () => {
  it("treats an empty contract address as preview mode", () => {
    const config = computeRuntimeConfig({ ...BASE, contractAddress: "" });
    expect(config.previewMode).toBe(true);
    expect(config.contractAddress).toBe("");
  });

  it("treats the zero address as unconfigured (preview mode), not a live contract", () => {
    const config = computeRuntimeConfig({ ...BASE, contractAddress: "0x0000000000000000000000000000000000000000" });
    expect(config.previewMode).toBe(true);
    expect(config.contractAddress).toBe("");
  });

  it("accepts a well-formed 20-byte hex address and exits preview mode", () => {
    const config = computeRuntimeConfig({ ...BASE, contractAddress: "0x1234567890AbcdEF1234567890aBcdef12345678" });
    expect(config.previewMode).toBe(false);
    expect(config.contractAddress).toBe("0x1234567890AbcdEF1234567890aBcdef12345678");
  });

  it("rejects malformed addresses (wrong length, non-hex, injected script) and stays in preview mode", () => {
    for (const bad of [
      "0x123",
      "not-an-address",
      "0xZZZZ567890abcdef1234567890abcdef12345678",
      "<script>alert(1)</script>",
      "0x1234567890abcdef1234567890abcdef123456789" // one char too long
    ]) {
      const config = computeRuntimeConfig({ ...BASE, contractAddress: bad });
      expect(config.previewMode).toBe(true);
      expect(config.contractAddress).toBe("");
    }
  });

  it("trims surrounding whitespace before validating", () => {
    const config = computeRuntimeConfig({ ...BASE, contractAddress: "  0x1234567890AbcdEF1234567890aBcdef12345678  " });
    expect(config.previewMode).toBe(false);
  });
});

describe("computeRuntimeConfig — deploy block parsing", () => {
  it("parses a well-formed numeric string", () => {
    expect(computeRuntimeConfig({ ...BASE, contractDeployBlock: "12345" }).deployBlock).toBe(12345n);
  });

  it("never throws on a malformed deploy block — falls back to null instead of crashing the app at import time", () => {
    for (const bad of ["not-a-number", "12.5", "-5", "0x10", "12345; DROP TABLE users;", "NaN", "Infinity"]) {
      expect(() => computeRuntimeConfig({ ...BASE, contractDeployBlock: bad })).not.toThrow();
      expect(computeRuntimeConfig({ ...BASE, contractDeployBlock: bad }).deployBlock).toBeNull();
    }
  });

  it("treats an empty string as null (deploy block not configured)", () => {
    expect(computeRuntimeConfig({ ...BASE, contractDeployBlock: "" }).deployBlock).toBeNull();
  });
});

describe("computeRuntimeConfig — token address handling", () => {
  it("mirrors the same validation as the contract address", () => {
    expect(computeRuntimeConfig({ ...BASE, tokenAddress: "0x1234567890AbcdEF1234567890aBcdef12345678" }).tokenAddress).toBe(
      "0x1234567890AbcdEF1234567890aBcdef12345678"
    );
    expect(computeRuntimeConfig({ ...BASE, tokenAddress: "garbage" }).tokenAddress).toBe("");
    expect(computeRuntimeConfig({ ...BASE, tokenAddress: "0x0000000000000000000000000000000000000000" }).tokenAddress).toBe("");
  });
});

describe("computeRuntimeConfig — RPC URL resolution", () => {
  it("uses the network's public default when no override is set", () => {
    expect(computeRuntimeConfig({ ...BASE, network: "testnet", rpcUrl: "" }).rpcUrl).toBe("https://rpc.testnet.chain.robinhood.com");
  });

  it("uses the configured override when set", () => {
    expect(computeRuntimeConfig({ ...BASE, rpcUrl: "https://my-provider.example/abc123" }).rpcUrl).toBe(
      "https://my-provider.example/abc123"
    );
  });
});
