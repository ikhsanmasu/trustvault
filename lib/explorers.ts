// ---------------------------------------------------------------------------
// Block explorer URL builders for P5 blockchain anchoring.
// Constructs explorer links from chain name + transaction hash.
// Per docs/blockchain.md Section 8d.
// ---------------------------------------------------------------------------

const EXPLORER_URLS: Record<string, string> = {
  anvil: null as unknown as string, // no public explorer
  sepolia: "https://sepolia.etherscan.io/tx/{txHash}",
  "base-sepolia": "https://sepolia.basescan.org/tx/{txHash}",
  base: "https://basescan.org/tx/{txHash}",
  optimism: "https://optimistic.etherscan.io/tx/{txHash}",
  mainnet: "https://etherscan.io/tx/{txHash}",
};

// Also map numeric chain IDs for convenience
const CHAIN_ID_TO_EXPLORER: Record<number, string> = {
  31337: null as unknown as string,
  11155111: "https://sepolia.etherscan.io/tx/{txHash}",
  84532: "https://sepolia.basescan.org/tx/{txHash}",
  8453: "https://basescan.org/tx/{txHash}",
  10: "https://optimistic.etherscan.io/tx/{txHash}",
  1: "https://etherscan.io/tx/{txHash}",
};

/**
 * Builds a block explorer URL for a given chain and transaction hash.
 * Returns `null` if the chain has no public explorer (e.g., "anvil").
 */
export function buildExplorerUrl(
  chain: string | null | undefined,
  txHash: string | null | undefined,
): string | null {
  if (!chain || !txHash) return null;

  const template = EXPLORER_URLS[chain.toLowerCase()];
  if (!template) return null;

  return template.replace("{txHash}", txHash);
}
