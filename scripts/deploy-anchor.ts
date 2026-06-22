/**
 * TrustVault — Deploy TrustVaultAnchor contract
 *
 * Usage:
 *   npx tsx scripts/deploy-anchor.ts
 *
 * Requires env vars (set in .env.local):
 *   ANCHOR_RPC_URL     — e.g., http://127.0.0.1:8545 (Anvil) or testnet RPC
 *   ANCHOR_PRIVATE_KEY — deployer private key (0x-prefixed hex)
 *
 * Outputs the deployed contract address. Update ANCHOR_CONTRACT_ADDRESS
 * in your .env.local with the printed value.
 */

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Simple .env parser (no dependency)
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch { /* not found */ }
}
loadEnv(resolve(process.cwd(), ".env.local"));

const RPC = process.env.ANCHOR_RPC_URL;
const PK = process.env.ANCHOR_PRIVATE_KEY;

if (!RPC || !PK) {
  console.error("ANCHOR_RPC_URL and ANCHOR_PRIVATE_KEY must be set in .env.local");
  process.exit(1);
}

// Read compiled ABI and bytecode from Foundry/Hardhat artifacts.
// If you compiled with `forge build`, the artifact is at:
//   out/TrustVaultAnchor.sol/TrustVaultAnchor.json
// For now, we inline the ABI and creation bytecode of the minimal contract.
const ABI = [
  { type: "function", name: "verify", inputs: [{ name: "fingerprint", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "anchoredAt", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "anchor", inputs: [{ name: "fingerprint", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "event", name: "Anchored", inputs: [
    { indexed: true, name: "fingerprint", type: "bytes32" },
    { indexed: false, name: "timestamp", type: "uint256" },
    { indexed: true, name: "sender", type: "address" },
  ] },
] as const;

const BYTECODE = "0x608060405234801561000f575f80fd5b506102e68061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c806375e36616146100435780639591a61014610073578063eecdf927146100a3575b5f80fd5b61005d600480360381019061005891906101dc565b6100bf565b60405161006a919061021f565b60405180910390f35b61008d600480360381019061008891906101dc565b6100d8565b60405161009a919061021f565b60405180910390f35b6100bd60048036038101906100b891906101dc565b6100ec565b005b5f805f8381526020019081526020015f20549050919050565b5f602052805f5260405f205f915090505481565b5f805f8381526020019081526020015f20541461013e576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161013590610292565b60405180910390fd5b425f808381526020019081526020015f20819055503373ffffffffffffffffffffffffffffffffffffffff16817f84dbb9ce184d1878830cd808f179fc6831bdd837296520e4726615daf660c9cf4260405161019a919061021f565b60405180910390a350565b5f80fd5b5f819050919050565b6101bb816101a9565b81146101c5575f80fd5b50565b5f813590506101d6816101b2565b92915050565b5f602082840312156101f1576101f06101a5565b5b5f6101fe848285016101c8565b91505092915050565b5f819050919050565b61021981610207565b82525050565b5f6020820190506102325f830184610210565b92915050565b5f82825260208201905092915050565b7f416c726561647920616e63686f726564000000000000000000000000000000005f82015250565b5f61027c601083610238565b915061028782610248565b602082019050919050565b5f6020820190508181035f8301526102a981610270565b905091905056fea26469706673582212208941693ddea5a879caf1438f1abe43bd844931ab597aa92468c57d9b812ed0ba64736f6c63430008140033";

async function main() {
  const account = privateKeyToAccount(PK as `0x${string}`);
  console.log(`Deploying from: ${account.address}`);
  console.log(`RPC: ${RPC}`);

  const rpc = RPC!;
  const chain = defineChain({ id: 31337, name: "Anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const publicClient = createPublicClient({ transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

  const txHash = await walletClient.deployContract({
    abi: ABI,
    bytecode: BYTECODE,
    account,
    chain,
  });

  console.log(`Transaction: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Deployed at: ${receipt.contractAddress}`);
  console.log(`Block: ${receipt.blockNumber}`);

  // Write to file for docker-compose automation
  const addrFile = process.env.ANCHOR_ADDR_FILE || "/tmp/deploy-output.txt";
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(addrFile, receipt.contractAddress!);
    console.log(`Address written to ${addrFile}`);
  } catch { /* ignore */ }

  console.log("");
  console.log("Add this to your .env.local:");
  console.log(`ANCHOR_CONTRACT_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
