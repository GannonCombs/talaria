import { KeychainManager } from './security/keychain';

export interface ChainBalance {
  chain: string;
  symbol: string;
  balance: number;
  usdValue: number;
}

export interface LinkedAccount {
  type: 'card' | 'bank';
  label: string;
}

export interface WalletInfo {
  exists: boolean;
  evmAddress: string;
  evmAddressFull: string;
  solanaAddress: string;
  solanaAddressFull: string;
  totalUsd: number;
  evmBalances: ChainBalance[];
  solanaBalances: ChainBalance[];
  linkedAccounts: LinkedAccount[];
}

// ── Wallet addresses (derived from OS keychain keys) ──

export async function walletExists(): Promise<boolean> {
  return KeychainManager.hasEvmKey();
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function getWalletBalance(): Promise<WalletInfo> {
  const evmAddress = await KeychainManager.getEvmAddress();

  if (!evmAddress) {
    return {
      exists: false,
      evmAddress: '',
      evmAddressFull: '',
      solanaAddress: '',
      solanaAddressFull: '',
      totalUsd: 0,
      evmBalances: [],
      solanaBalances: [],
      linkedAccounts: [],
    };
  }

  const solanaAddress = (await KeychainManager.getSolanaAddress()) ?? '';

  // Query all balances in parallel
  const [tempoUsdc, baseUsdc, solBalance] = await Promise.all([
    queryErc20Balance('https://rpc.tempo.xyz', '0x20C000000000000000000000b9537d11c60E8b50', evmAddress, 6),
    queryErc20Balance('https://mainnet.base.org', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', evmAddress, 6),
    solanaAddress ? querySolBalance(solanaAddress) : Promise.resolve(0),
  ]);

  const evmBalances: ChainBalance[] = [
    { chain: 'tempo', symbol: 'USDC', balance: tempoUsdc, usdValue: tempoUsdc },
    { chain: 'base', symbol: 'USDC', balance: baseUsdc, usdValue: baseUsdc },
  ];
  const solanaBalances: ChainBalance[] = [
    { chain: 'solana', symbol: 'SOL', balance: solBalance, usdValue: 0 },
  ];

  const totalUsd = evmBalances.reduce((s, b) => s + b.usdValue, 0);

  return {
    exists: true,
    evmAddress: truncateAddress(evmAddress),
    evmAddressFull: evmAddress,
    solanaAddress: solanaAddress ? truncateAddress(solanaAddress) : '',
    solanaAddressFull: solanaAddress,
    totalUsd,
    evmBalances,
    solanaBalances,
    linkedAccounts: [],
  };
}

// ── Wallet creation (via AgentCash) ──

export async function createWallet(): Promise<{ evmAddress: string; solanaAddress: string }> {
  const evmAddr = await KeychainManager.getEvmAddress();
  const solAddr = await KeychainManager.getSolanaAddress();

  if (evmAddr) {
    return { evmAddress: evmAddr, solanaAddress: solAddr ?? '' };
  }

  throw new Error('Run "npx tsx scripts/migrate-wallet.ts" to create a wallet');
}

// ── On-chain balance queries ──

async function queryErc20Balance(
  rpcUrl: string,
  tokenContract: string,
  walletAddress: string,
  decimals: number
): Promise<number> {
  try {
    const paddedAddress = walletAddress.replace('0x', '').padStart(64, '0');
    const data = '0x70a08231' + paddedAddress;

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: tokenContract, data }, 'latest'],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const json = await res.json();
    if (json.result && json.result !== '0x') {
      const raw = BigInt(json.result);
      return Number(raw) / Math.pow(10, decimals);
    }
    return 0;
  } catch {
    return 0;
  }
}

async function querySolBalance(address: string): Promise<number> {
  if (!address) return 0;
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getBalance',
        params: [address],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const json = await res.json();
    if (json.result?.value) {
      return json.result.value / 1e9;
    }
    return 0;
  } catch {
    return 0;
  }
}
