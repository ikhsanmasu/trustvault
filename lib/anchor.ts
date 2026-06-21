import {
  keccak256,
  encodePacked,
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbi,
  type PublicClient,
  type WalletClient,
  type Account,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Chain ID to human-readable name mapping
// ---------------------------------------------------------------------------

const CHAIN_ID_TO_NAME: Record<number, string> = {
  31337: "anvil",
  11155111: "sepolia",
  8453: "base",
  10: "optimism",
  1: "mainnet",
};

// ---------------------------------------------------------------------------
// AnchorService interface
// ---------------------------------------------------------------------------

export interface AnchorService {
  /**
   * Anchors a fingerprint on-chain.
   * @returns The transaction hash and block timestamp.
   * @throws If the fingerprint is already anchored or the transaction reverts.
   */
  anchor(fingerprint: `0x${string}`): Promise<{
    txHash: `0x${string}`;
    anchoredAt: number; // unix timestamp (seconds)
  }>;

  /**
   * Verifies a fingerprint against the on-chain registry.
   * @returns The block timestamp if found, or null if not anchored.
   */
  verify(fingerprint: `0x${string}`): Promise<{
    anchoredAt: number | null;
    found: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// AnchorServiceConfig
// ---------------------------------------------------------------------------

export interface AnchorServiceConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: `0x${string}`;
  signer: Account;
}

// ---------------------------------------------------------------------------
// TrustVaultAnchor ABI (matching docs/blockchain.md Section 3c)
// ---------------------------------------------------------------------------

const TRUST_VAULT_ANCHOR_ABI = parseAbi([
  "function anchor(bytes32 fingerprint) external",
  "function verify(bytes32 fingerprint) external view returns (uint256)",
  "function anchoredAt(bytes32 fingerprint) external view returns (uint256)",
  "event Anchored(bytes32 indexed fingerprint, uint256 indexed anchoredAt)",
]);

// ---------------------------------------------------------------------------
// EvmAnchorService
// ---------------------------------------------------------------------------

class EvmAnchorService implements AnchorService {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private contractAddress: `0x${string}`;
  private signer: Account;
  private chainName: string;
  private chain: ReturnType<typeof defineChain>;

  constructor(config: AnchorServiceConfig) {
    const chain = defineChain({
      id: config.chainId,
      name: `Anchor Chain (${config.chainId})`,
      rpcUrls: { default: { http: [config.rpcUrl] } },
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });

    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
      chain,
    });
    this.walletClient = createWalletClient({
      transport: http(config.rpcUrl),
      chain,
      account: config.signer,
    });
    this.contractAddress = config.contractAddress;
    this.signer = config.signer;
    this.chain = chain;
    this.chainName =
      CHAIN_ID_TO_NAME[config.chainId] ?? String(config.chainId);
  }

  /** Returns the human-readable chain name for this service instance. */
  getChainName(): string {
    return this.chainName;
  }

  async anchor(fingerprint: `0x${string}`): Promise<{
    txHash: `0x${string}`;
    anchoredAt: number;
  }> {
    // 1. Dry-run (simulateContract) to catch reverts early.
    try {
      await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: TRUST_VAULT_ANCHOR_ABI,
        functionName: "anchor",
        args: [fingerprint],
        account: this.signer,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Simulation failed";
      if (msg.includes("Already anchored")) {
        throw new Error("Fingerprint already anchored");
      }
      if (msg.includes("insufficient") || msg.includes("Insufficient")) {
        throw new Error("Insufficient balance for anchor transaction");
      }
      throw new Error(`Anchor transaction simulation failed: ${msg}`);
    }

    // 2. Send transaction.
    let txHash: Hash;
    try {
      txHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: TRUST_VAULT_ANCHOR_ABI,
        functionName: "anchor",
        args: [fingerprint],
        chain: this.chain,
        account: this.signer,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("Already anchored")) {
        throw new Error("Fingerprint already anchored");
      }
      if (msg.includes("insufficient") || msg.includes("Insufficient")) {
        throw new Error("Insufficient balance for anchor transaction");
      }
      throw new Error(`Anchor transaction failed: ${msg}`);
    }

    // 3. Wait for receipt (120s timeout).
    let receipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Receipt wait failed";
      throw new Error(`Anchor transaction timed out: ${msg}`);
    }

    // 4. Fetch the block to get its timestamp.
    const block = await this.publicClient.getBlock({
      blockHash: receipt.blockHash,
    });
    const anchoredAt = Number(block.timestamp);

    return { txHash, anchoredAt };
  }

  async verify(fingerprint: `0x${string}`): Promise<{
    anchoredAt: number | null;
    found: boolean;
  }> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: TRUST_VAULT_ANCHOR_ABI,
        functionName: "verify",
        args: [fingerprint],
      });

      // readContract returns the uint256 as a bigint.
      const anchoredAt = Number(result);
      if (anchoredAt === 0) {
        return { found: false, anchoredAt: null };
      }
      return { found: true, anchoredAt };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown RPC error";
      throw new Error(`Anchor RPC unreachable: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Signer factory
// ---------------------------------------------------------------------------

/**
 * Creates a viem Account from a private key.
 *
 * TODO (production): Replace with AWS KMS / HashiCorp Vault signing.
 * The private key must never be logged or exposed to the client.
 */
export function createSigner(privateKey: `0x${string}`): Account {
  return privateKeyToAccount(privateKey);
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/**
 * Factory: reads env vars and returns a configured AnchorService plus the
 * human-readable chain name for storage in the database.
 *
 * Required env vars:
 * - ANCHOR_RPC_URL
 * - ANCHOR_CHAIN_ID
 * - ANCHOR_CONTRACT_ADDRESS
 * - ANCHOR_PRIVATE_KEY
 */
export function getAnchorService(): {
  service: AnchorService;
  chainName: string;
} {
  const rpcUrl = process.env.ANCHOR_RPC_URL;
  const chainIdRaw = process.env.ANCHOR_CHAIN_ID;
  const chainId = chainIdRaw ? Number(chainIdRaw) : NaN;
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS as
    | `0x${string}`
    | undefined;
  const privateKey = process.env.ANCHOR_PRIVATE_KEY as
    | `0x${string}`
    | undefined;

  if (!rpcUrl || isNaN(chainId) || !contractAddress || !privateKey) {
    throw new Error(
      "Missing anchor service configuration. Check ANCHOR_* env vars.",
    );
  }

  const signer = createSigner(privateKey);
  const service = new EvmAnchorService({
    rpcUrl,
    chainId,
    contractAddress,
    signer,
  });
  const chainName = service.getChainName();

  return { service, chainName };
}

/**
 * Creates a read-only public client for verification (no signer needed).
 * Used by the verify endpoint which only calls readContract.
 */
export function getPublicVerifier(): { verify: (fp: `0x${string}`) => Promise<{ found: boolean; anchoredAt: number | null }> } {
  const rpcUrl = process.env.ANCHOR_RPC_URL;
  const chainIdRaw = process.env.ANCHOR_CHAIN_ID;
  const chainId = chainIdRaw ? Number(chainIdRaw) : NaN;
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}` | undefined;

  if (!rpcUrl || isNaN(chainId) || !contractAddress) {
    throw new Error("Missing anchor service configuration. Check ANCHOR_RPC_URL, ANCHOR_CHAIN_ID, ANCHOR_CONTRACT_ADDRESS env vars.");
  }

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const contractAbi = parseAbi(["function verify(bytes32) view returns (uint256)"]);

  return {
    verify: async (fp: `0x${string}`) => {
      try {
        const ts = (await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: "verify",
          args: [fp],
        })) as unknown as bigint;
        const tsNum = Number(ts);
        return { found: tsNum > 0, anchoredAt: tsNum > 0 ? tsNum : null };
      } catch {
        return { found: false, anchoredAt: null };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fingerprint computation
// ---------------------------------------------------------------------------

/**
 * Computes a blockchain-anchorable fingerprint from the two document hashes.
 *
 * fingerprint = keccak256(abi.encodePacked(binaryHashAsBytes32, textHashAsBytes32))
 *
 * Given the same two SHA-256 hashes, this is deterministic -- no salts, nonces,
 * or random components.
 *
 * @param binaryHash - 64-char lowercase hex string (no 0x prefix), as stored in `documents.binary_hash`
 * @param textHash   - 64-char lowercase hex string (no 0x prefix), as stored in `documents.text_hash`
 * @returns 0x-prefixed keccak256 hash (66 characters), suitable for the smart contract's `anchor()`.
 */
export function computeFingerprint(
  binaryHash: string,
  textHash: string,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["bytes32", "bytes32"],
      [`0x${binaryHash}`, `0x${textHash}`],
    ),
  );
}
