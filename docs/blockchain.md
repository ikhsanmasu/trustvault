# inTrustVault -- Blockchain Anchoring Specification (P5)

This document is a **contract**. The `backend`, `deployment`, and `frontend` agents use it as the authoritative reference for blockchain anchoring. It specifies the smart contract, fingerprint computation, AnchorService abstraction, deployment procedure, and chain configuration.

---

## 1. Overview

inTrustVault P5 adds **blockchain anchoring** to prove document integrity. The system already produces two SHA-256 hashes per document: `binary_hash` and `text_hash` (stored as 64-character lowercase hex strings). P5 compresses these into a single bytes32 **fingerprint** via `keccak256(abi.encodePacked(...))` and writes that fingerprint to an EVM-compatible blockchain via a minimal smart contract.

**Key principles:**

- **Chain-agnostic:** All chain-specific configuration comes from environment variables. Switching from Anvil (local dev) to Sepolia (testnet) to a production L2 is a configuration change, not a code change.
- **Server-side only:** The private key used to sign anchoring transactions lives in `ANCHOR_PRIVATE_KEY` and never reaches the browser. All blockchain calls happen inside Next.js API route handlers or deployment scripts.
- **Do not modify the hashing pipeline:** `lib/core.ts` is consumed as-is. P5 only reads `binary_hash` and `text_hash` from existing document records.
- **One anchor per document:** Each document gets exactly one fingerprint stored on-chain. No Merkle trees, no batching, no async queues in P5. The code structure is designed so batching and async can be added in a future phase.
- **Immutable on-chain:** Once anchored, a fingerprint cannot be overwritten. The smart contract enforces this with a `require` check.

---

## 2. Fingerprint Computation

### 2a. Formula

```
fingerprint = keccak256(abi.encodePacked(binaryHashAsBytes32, textHashAsBytes32))
```

Where:
- `binaryHashAsBytes32` is the `binary_hash` string (64 hex chars, no `0x` prefix) interpreted as a bytes32 value.
- `textHashAsBytes32` is the `text_hash` string (64 hex chars, no `0x` prefix) interpreted as a bytes32 value.
- `abi.encodePacked` tightly packs the two 32-byte values into a 64-byte buffer.
- `keccak256` produces a 32-byte (bytes32) result.

### 2b. TypeScript Implementation (viem)

```ts
import { keccak256, encodePacked } from "viem";

/**
 * Computes a blockchain-anchorable fingerprint from the two document hashes.
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
```

**Required dependency:** `viem` (added to `package.json` by the `scaffold` agent).

**Location:** `lib/anchor.ts` (owned by `backend`).

### 2c. Solidity Equivalent

```solidity
bytes32 fingerprint = keccak256(abi.encodePacked(_binaryHash, _textHash));
```

This equality is the cryptographic guarantee of the system: the same inputs produce the same fingerprint off-chain (viem) and on-chain (Solidity). A recomputed fingerprint that does not match the stored on-chain value constitutes evidence of tampering.

---

## 3. Smart Contract Specification

### 3a. Contract: `inTrustVaultAnchor`

**File:** `contracts/inTrustVaultAnchor.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title inTrustVaultAnchor
/// @notice Immutable fingerprint registry for document integrity verification.
///         Once a fingerprint is anchored it cannot be overwritten.
contract inTrustVaultAnchor {
    /// @notice Maps a document fingerprint to the block timestamp when it was first anchored.
    ///         Value is 0 if the fingerprint has never been anchored.
    mapping(bytes32 => uint256) public anchoredAt;

    /// @notice Emitted when a new fingerprint is successfully anchored.
    /// @param fingerprint The keccak256-packed document fingerprint (bytes32).
    /// @param anchoredAt  The block timestamp at which the anchor was recorded.
    event Anchored(bytes32 indexed fingerprint, uint256 indexed anchoredAt);

    /// @notice Anchor a document fingerprint on-chain.
    /// @dev Reverts if the fingerprint has already been anchored.
    /// @param fingerprint The keccak256(abi.encodePacked(binaryHash, textHash)) value.
    function anchor(bytes32 fingerprint) external {
        require(anchoredAt[fingerprint] == 0, "Already anchored");
        anchoredAt[fingerprint] = block.timestamp;
        emit Anchored(fingerprint, block.timestamp);
    }

    /// @notice Verify whether a fingerprint has been anchored and when.
    /// @param fingerprint The document fingerprint to look up.
    /// @return The block timestamp when the fingerprint was anchored, or 0 if never anchored.
    function verify(bytes32 fingerprint) external view returns (uint256) {
        return anchoredAt[fingerprint];
    }
}
```

### 3b. Contract Properties

| Property | Value |
|---|---|
| Language | Solidity ^0.8.20 |
| License | MIT |
| State mutability | `anchor()` is state-changing; `verify()` is pure/read-only |
| Immutability | Once a fingerprint is set, it cannot be changed. No update or delete function exists. |
| Events | `Anchored(bytes32 indexed fingerprint, uint256 indexed anchoredAt)` |
| Gas cost | ~22,000 gas for first anchor (SSTORE from zero), ~2,600 gas for verify (SLOAD) |

### 3c. ABI Reference

The contract ABI, generated at compile time, exposes these functions:

```json
[
  {
    "type": "function",
    "name": "anchor",
    "inputs": [{ "name": "fingerprint", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verify",
    "inputs": [{ "name": "fingerprint", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "anchoredAt",
    "inputs": [{ "name": "fingerprint", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Anchored",
    "inputs": [
      { "name": "fingerprint", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "anchoredAt", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  }
]
```

---

## 4. AnchorService Abstraction

### 4a. TypeScript Interface

**File:** `lib/anchor.ts` (owned by `backend`)

```ts
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
```

### 4b. Configuration

```ts
export interface AnchorServiceConfig {
  rpcUrl: string;           // e.g. "http://127.0.0.1:8545" (Anvil) or Infura/Alchemy endpoint
  chainId: number;          // e.g. 31337 (Anvil), 11155111 (Sepolia)
  contractAddress: `0x${string}`; // deployed inTrustVaultAnchor address
  signer: ReturnType<typeof createSigner>; // viem wallet client
}
```

### 4c. EvmAnchorService Implementation

**Dependency:** `viem` (NOT ethers).

```ts
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Creates a viem signer from an ANCHOR_PRIVATE_KEY environment variable.
 *
 * TODO (production): Replace with AWS KMS / HashiCorp Vault signing.
 * The private key must never be logged or exposed to the client.
 */
export function createSigner(privateKey: `0x${string}`): Account {
  return privateKeyToAccount(privateKey);
}

/**
 * Factory: reads env vars and returns a configured AnchorService.
 * Uses ANCHOR_RPC_URL, ANCHOR_CHAIN_ID, ANCHOR_CONTRACT_ADDRESS, ANCHOR_PRIVATE_KEY.
 */
export function getAnchorService(): AnchorService {
  const rpcUrl = process.env.ANCHOR_RPC_URL;
  const chainId = Number(process.env.ANCHOR_CHAIN_ID);
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}`;
  const privateKey = process.env.ANCHOR_PRIVATE_KEY as `0x${string}`;

  if (!rpcUrl || !chainId || !contractAddress || !privateKey) {
    throw new Error("Missing anchor service configuration. Check ANCHOR_* env vars.");
  }

  const signer = createSigner(privateKey);
  return new EvmAnchorService({ rpcUrl, chainId, contractAddress, signer });
}

class EvmAnchorService implements AnchorService {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private contractAddress: `0x${string}`;
  private signer: Account;

  constructor(config: AnchorServiceConfig) {
    const chain = defineChain({
      id: config.chainId,
      name: `Anchor Chain (${config.chainId})`,
      rpcUrls: { default: { http: [config.rpcUrl] } },
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });

    this.publicClient = createPublicClient({ transport: http(config.rpcUrl), chain });
    this.walletClient = createWalletClient({ transport: http(config.rpcUrl), chain, account: config.signer });
    this.contractAddress = config.contractAddress;
    this.signer = config.signer;
  }

  async anchor(fingerprint: `0x${string}`) {
    // ...
  }

  async verify(fingerprint: `0x${string}`) {
    // ...
  }
}
```

The `anchor()` method:
1. Calls `publicClient.simulateContract()` to dry-run the `anchor` function (detects "Already anchored" revert early, avoids wasting gas).
2. Calls `walletClient.writeContract()` to send the transaction.
3. Waits for receipt via `publicClient.waitForTransactionReceipt()`.
4. Returns `{ txHash, anchoredAt }` where `anchoredAt` is the block timestamp from the receipt.

The `verify()` method:
1. Calls `publicClient.readContract()` with the `verify` function signature.
2. Returns `{ found: true, anchoredAt: timestamp }` or `{ found: false, anchoredAt: null }`.

### 4d. Error Handling

| Error condition | Behavior |
|---|---|
| "Already anchored" revert from contract | `anchor()` throws with message "Fingerprint already anchored" |
| RPC unreachable | `anchor()`/`verify()` throw with message "Anchor RPC unreachable" |
| Transaction timeout (no receipt within 120s) | `anchor()` throws with message "Anchor transaction timed out" |
| Insufficient balance for gas | `anchor()` throws with message "Insufficient balance for anchor transaction" |

---

## 5. Contract Deployment

### 5a. Deploy Script

**File:** `scripts/deploy-anchor.ts` (owned by `deployment` agent)

Uses `viem` to deploy the `inTrustVaultAnchor` contract. The script:

1. Reads `ANCHOR_RPC_URL`, `ANCHOR_CHAIN_ID`, `ANCHOR_PRIVATE_KEY` from env.
2. Creates a viem wallet client and public client.
3. Deploys the compiled bytecode + ABI from the contract artifact.
4. Outputs the deployed contract address.
5. Waits for the deployment receipt and confirms.

**Usage:**
```bash
npx tsx scripts/deploy-anchor.ts
```

**Output:**
```
Deploying inTrustVaultAnchor to chain 31337...
Transaction hash: 0x...
Contract deployed at: 0x...
```

After deployment, the contract address must be set as `ANCHOR_CONTRACT_ADDRESS` in `.env.local` (local dev) or Vercel environment variables (production).

### 5b. Contract Compilation

Use `solc` (Solidity compiler) or a toolchain like Foundry (`forge build`). The simplest approach for this project:

1. Install `solc`: `npm install --save-dev solc@0.8.20` (optional -- compilation can also be done with Foundry).
2. Compile: `npx solcjs --bin --abi --optimize --base-path . contracts/inTrustVaultAnchor.sol -o contracts/out/`
3. The deploy script reads `contracts/out/inTrustVaultAnchor_sol_inTrustVaultAnchor.abi` and `contracts/out/inTrustVaultAnchor_sol_inTrustVaultAnchor.bin`.

**Alternative (recommended for dev velocity):** Use Foundry:
```bash
forge build --contracts contracts/
```
This produces artifacts in `out/` that the deploy script reads.

---

## 6. Local Development Setup (Anvil)

### 6a. What is Anvil

Anvil is a local Ethereum node bundled with Foundry. It provides:
- A local RPC endpoint at `http://127.0.0.1:8545`.
- Prefunded accounts with 10,000 ETH each (no need to fund gas).
- Instant block production (no mining wait).
- Chain ID 31337.

### 6b. Starting Anvil

**Prerequisite:** Install Foundry (see https://book.getfoundry.sh/getting-started/installation).

```bash
anvil
```

This outputs:
```
Available Accounts
==================

(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...

Private Keys
==================

(0) 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
...

Listening on 127.0.0.1:8545
```

Use one of these private keys as `ANCHOR_PRIVATE_KEY`. The prefunded balance means no testnet ETH faucet is needed.

### 6c. Local Dev Env Vars

```
ANCHOR_RPC_URL=http://127.0.0.1:8545
ANCHOR_CHAIN_ID=31337
ANCHOR_CONTRACT_ADDRESS=<output from deploy-anchor.ts>
ANCHOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 6d. Local Dev Workflow

1. Start Anvil: `anvil` (terminal 1)
2. Deploy contract: `npx tsx scripts/deploy-anchor.ts` (terminal 2)
3. Copy the output contract address into `.env.local` as `ANCHOR_CONTRACT_ADDRESS`
4. Start Next.js: `npm run dev` (terminal 2)
5. Anchor and verify documents through the inTrustVault UI

---

## 7. Railway Deployment (Production Anvil / Lightweight Node)

For a persistent blockchain endpoint in a deployed environment, run Anvil inside a Docker container on Railway. This is suitable for staging/demo environments. For production mainnet/testnet, use a real RPC provider (see Section 8).

### 7a. Dockerfile for Anvil

**File:** `docker/anvil.Dockerfile` (owned by `deployment` agent)

```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest

# Create a directory for persistent state
RUN mkdir -p /data

# Expose the default Anvil port
EXPOSE 8545

# Start Anvil with persistent state file
# --host 0.0.0.0 makes it accessible outside the container
# --block-time 1 produces blocks every 1 second (optional; omit for instant blocks)
ENTRYPOINT ["anvil", "--host", "0.0.0.0", "--state", "/data/anvil.state", "--state-interval", "5"]
```

### 7b. Railway Configuration

| Setting | Value |
|---|---|
| Service name | `intrustvault-anvil` |
| Dockerfile path | `docker/anvil.Dockerfile` |
| Port | 8545 |
| Health check path | TCP port 8545 |
| Volume mount | `/data` (persistent, to survive restarts) |

### 7c. Why Anvil on Railway and not a public testnet

- **No external faucet dependency:** Prefunded accounts eliminate gas-token logistics.
- **Deterministic state:** The state file can be committed (in an encrypted form) for reproducible tests.
- **No rate limiting:** Public testnet RPC endpoints often throttle.
- **Suitable for demo/staging:** For a real production deployment, switch to a public testnet or mainnet L2 (Section 8).

---

## 8. Chain Configuration Guide

### 8a. Environment Variables

All four variables are **server-only**. None has a `NEXT_PUBLIC_` prefix. The private key must never be bundled into client-side JavaScript.

| Variable | Type | Description | Example (Anvil) | Example (Sepolia) |
|---|---|---|---|---|
| `ANCHOR_RPC_URL` | URL | JSON-RPC endpoint for the anchor chain | `http://127.0.0.1:8545` | `https://sepolia.infura.io/v3/YOUR_KEY` |
| `ANCHOR_CHAIN_ID` | number | EVM chain ID | `31337` | `11155111` |
| `ANCHOR_CONTRACT_ADDRESS` | `0x${string}` | Deployed `inTrustVaultAnchor` address | `0x5FbDB2...` | `0x...` |
| `ANCHOR_PRIVATE_KEY` | `0x${string}` | Private key for the anchor signer (64 hex chars + 0x) | `0xac0974...` | `0x...` |

### 8b. Supported Chains

The system is chain-agnostic. Any EVM-compatible chain works. Recommended configurations:

| Environment | Chain | Chain ID | RPC Provider | Gas Cost |
|---|---|---|---|---|
| Local dev | Anvil (Foundry) | 31337 | `http://127.0.0.1:8545` | Free |
| Staging | Sepolia testnet | 11155111 | Infura / Alchemy | ~0.01 testnet ETH per 100 anchors |
| Demo | Anvil on Railway | 31337 | Railway internal URL | Free |
| Production (low-cost) | Base / Optimism L2 | 8453 / 10 | QuickNode / Alchemy | ~$0.01 per anchor |
| Production (high-security) | Ethereum mainnet | 1 | Infura / Alchemy | ~$5-20 per anchor |

### 8c. Gas Funding

The account behind `ANCHOR_PRIVATE_KEY` must have a balance to pay for gas on the target chain.

- **Anvil:** Accounts (0)-(9) are prefunded with 10,000 ETH. No action needed.
- **Sepolia:** Use a faucet (e.g., sepoliafaucet.com) to fund the account.
- **Mainnet/L2:** Bridge or purchase ETH on the target chain.

### 8d. Block Explorer Links (frontend)

The `chain` column in the documents table stores a human-readable chain identifier (e.g., `"anvil"`, `"sepolia"`, `"base"`). The frontend uses this to construct a block explorer link for the transaction hash.

| `chain` value | Explorer URL template |
|---|---|
| `"anvil"` | No public explorer (show tx hash only) |
| `"sepolia"` | `https://sepolia.etherscan.io/tx/{txHash}` |
| `"base"` | `https://basescan.org/tx/{txHash}` |
| `"optimism"` | `https://optimistic.etherscan.io/tx/{txHash}` |
| `"mainnet"` | `https://etherscan.io/tx/{txHash}` |

The mapping from `chain` string to explorer URL is maintained in a frontend constant (e.g., `lib/explorers.ts` or a component-level map). The `chain` value stored in the database is set by the backend at anchor time from the `ANCHOR_CHAIN_ID` env var.

---

## 9. Forward Compatibility Notes

### 9a. Async Queuing (future)

The `AnchorService` interface is synchronous (anchor returns a promise resolved after the transaction is confirmed). For high-throughput production use, replace or wrap `EvmAnchorService` with a queue-based implementation:

1. `anchor()` enqueues a job and returns immediately with a `pending` status.
2. A background worker picks up jobs, sends transactions, and updates the DB.
3. The `documents` table gets a new `anchor_status` column: `pending | confirmed | failed`.

The current synchronous design makes this easy: the API route handler calls `anchor()` and waits. To switch to async, the handler calls `enqueue()` instead, and the AnchorService implementation handles the rest. No API route signature changes are needed.

### 9b. Merkle Tree Batching (future)

Multiple document fingerprints can be batched into a single Merkle root anchored on-chain, reducing gas costs. The current design anchors one fingerprint per transaction. To add batching:

1. Collect N document fingerprints.
2. Build a Merkle tree; the root becomes the on-chain fingerprint.
3. Each document stores its Merkle proof alongside the root.
4. Verification reconstructs the proof path.

The smart contract `inTrustVaultAnchor` remains unchanged (it still stores a single bytes32 -> timestamp mapping). The change is in the AnchorService layer and the database schema.

### 9c. Multi-Chain Anchoring (future)

A document could be anchored to multiple chains for redundancy. This would require:
- An `anchor_entries` child table (one row per chain per document).
- The `anchor()` API accepts an optional `chain` parameter.
- The `verify()` API checks all chains.

### 9d. KMS Signing (production)

The `createSigner()` factory currently uses `privateKeyToAccount` from viem. For production security, replace with a KMS-backed signer (AWS KMS, GCP KMS, or HashiCorp Vault). The `AnchorService` interface does not change -- only the signer creation logic changes.
