/**
 * Transfer USDC.e from our Talaria wallet to the AgentCash wallet on Tempo.
 *
 * Usage: npx tsx scripts/transfer-to-agentcash.ts
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const TEMPO_RPC = 'https://rpc.tempo.xyz';
const USDC_CONTRACT = '0x20C000000000000000000000b9537d11c60E8b50';
const AGENTCASH_ADDRESS = '0xF1d0bdEac9Acf70c62f989Fc35D1a779567a6c2F';

async function main() {
  // Read our private key
  const pkFile = path.join(process.cwd(), 'keys', 'wallet.key');
  let raw: string;
  try {
    raw = fs.readFileSync(pkFile, 'utf8').trim();
  } catch {
    console.error('No wallet key found at', pkFile);
    process.exit(1);
  }

  // Handle old JSON format
  let evmKey: string;
  try {
    evmKey = JSON.parse(raw).evm;
  } catch {
    evmKey = raw;
  }

  // Connect to Tempo
  const provider = new ethers.JsonRpcProvider(TEMPO_RPC, {
    name: 'tempo',
    chainId: 4217,
  });
  const wallet = new ethers.Wallet(evmKey, provider);

  console.log('From:', wallet.address);
  console.log('To:', AGENTCASH_ADDRESS);

  // Check balance first
  const erc20Abi = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
  ];
  const token = new ethers.Contract(USDC_CONTRACT, erc20Abi, wallet);

  const balance = await token.balanceOf(wallet.address);
  const decimals = await token.decimals();
  const balanceFormatted = ethers.formatUnits(balance, decimals);

  console.log('Balance:', balanceFormatted, 'USDC.e');

  if (balance === 0n) {
    console.log('No balance to transfer');
    process.exit(0);
  }

  // Transfer entire balance
  console.log(`Transferring ${balanceFormatted} USDC.e to AgentCash wallet...`);

  const tx = await token.transfer(AGENTCASH_ADDRESS, balance);
  console.log('Tx hash:', tx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);
  console.log('Done! Check balance at https://explore.tempo.xyz/address/' + AGENTCASH_ADDRESS);
}

main().catch((err) => {
  console.error('Transfer failed:', err.message);
  process.exit(1);
});
