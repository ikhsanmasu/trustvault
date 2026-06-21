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
  { type: "function", name: "anchor", inputs: [{ name: "fingerprint", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "verify", inputs: [{ name: "fingerprint", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "anchoredAt", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "event", name: "Anchored", inputs: [
    { indexed: true, name: "fingerprint", type: "bytes32" },
    { indexed: false, name: "timestamp", type: "uint256" },
    { indexed: true, name: "sender", type: "address" },
  ] },
] as const;

const BYTECODE = "0x608060405234801561001057600080fd5b5061017b806100206000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c806304e8d12b1461005157806399b4739014610081578063d26ee22e146100b1578063fc2b1cdc146100cf575b600080fd5b61006b600480360381019061006691906100f7565b6100ed565b6040516100789190610133565b60405180910390f35b61009b600480360381019061009691906100f7565b610105565b6040516100a89190610133565b60405180910390f35b6100b9610115565b6040516100c69190610133565b60405180910390f35b6100d761012b565b6040516100e49190610133565b60405180910390f35b60006020528060005260406000206000915090505481565b60006020819052908152604090205481565b60008060016000828254610129919061014e565b92505081905550565b60008054905090565b60006020828403121561010957600080fd5b81359050919050565b6000819050919050565b6000819050919050565b61014881610135565b82525050565b600061015982610135565b915061016483610135565b925082820190508082111561017c5761017b61013f565b5b9291505056fea2646970667358221220c1dda2b75927b12ba6beb16d298819b8e3d3b53b80c1465c1c4e0a1c87e5b1d064736f6c63430008140033";

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
