/**
 * P5: Block Explorer URL builder tests.
 *
 * Validates the explorer URL mapping per docs/blockchain.md Section 8d.
 */
import { describe, it, expect } from "vitest";
import { buildExplorerUrl } from "./explorers";

describe("P5: buildExplorerUrl", () => {
  it("returns null for anvil (no public explorer)", () => {
    expect(
      buildExplorerUrl(
        "anvil",
        "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456",
      ),
    ).toBeNull();
  });

  it("returns correct URL for sepolia", () => {
    const txHash =
      "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456";
    expect(buildExplorerUrl("sepolia", txHash)).toBe(
      `https://sepolia.etherscan.io/tx/${txHash}`,
    );
  });

  it("returns correct URL for base", () => {
    const txHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(buildExplorerUrl("base", txHash)).toBe(
      `https://basescan.org/tx/${txHash}`,
    );
  });

  it("returns correct URL for optimism", () => {
    const txHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(buildExplorerUrl("optimism", txHash)).toBe(
      `https://optimistic.etherscan.io/tx/${txHash}`,
    );
  });

  it("returns correct URL for mainnet", () => {
    const txHash =
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    expect(buildExplorerUrl("mainnet", txHash)).toBe(
      `https://etherscan.io/tx/${txHash}`,
    );
  });

  it("returns null when chain is null", () => {
    expect(buildExplorerUrl(null, "0xdeadbeef")).toBeNull();
  });

  it("returns null when chain is undefined", () => {
    expect(buildExplorerUrl(undefined, "0xdeadbeef")).toBeNull();
  });

  it("returns null when txHash is null", () => {
    expect(buildExplorerUrl("sepolia", null)).toBeNull();
  });

  it("returns null when txHash is undefined", () => {
    expect(buildExplorerUrl("sepolia", undefined)).toBeNull();
  });

  it("returns null for an unknown chain name", () => {
    expect(
      buildExplorerUrl(
        "polygon",
        "0x9e5c7b64a1234567890abcdef1234567890abcdef1234567890abcdef123456",
      ),
    ).toBeNull();
  });

  it("matches chain name case-insensitively", () => {
    const txHash =
      "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    expect(buildExplorerUrl("SEPOLIA", txHash)).toBe(
      `https://sepolia.etherscan.io/tx/${txHash}`,
    );
    expect(buildExplorerUrl("Sepolia", txHash)).toBe(
      `https://sepolia.etherscan.io/tx/${txHash}`,
    );
  });

  it("handles empty string chain", () => {
    expect(buildExplorerUrl("", "0xdeadbeef")).toBeNull();
  });

  it("handles empty string txHash", () => {
    expect(buildExplorerUrl("sepolia", "")).toBeNull();
  });
});
