import { RailIcon, MethodIcon } from '@/components/shared/PaymentIcons';
import { formatTxnTimestamp } from '@/lib/time';

export interface Transaction {
  id: number;
  timestamp: string;
  service: string;
  module: string;
  rail: string;
  via?: string;
  status: 'success' | 'pending' | 'error';
  costUsd: number;
}

const SERVICE_COLORS: Record<string, string> = {
  RentCast: 'bg-blue-400',
  Mapbox: 'bg-tertiary',
  Polymarket: 'bg-purple-400',
  'Alpha Vantage': 'bg-sky-400',
  Kraken: 'bg-tertiary',
  Firecrawl: 'bg-orange-400',
  OpenAI: 'bg-green-400',
  Anthropic: 'bg-amber-300',
  DoorDash: 'bg-red-400',
  'Whole Foods': 'bg-green-500',
  Coinbase: 'bg-blue-500',
  Lightspark: 'bg-amber-400',
  Alchemy: 'bg-blue-300',
  Jupiter: 'bg-purple-400',
  Codex: 'bg-sky-400',
  ElevenLabs: 'bg-indigo-400',
  Parallel: 'bg-teal-400',
  Ramp: 'bg-emerald-400',
  StellarPay: 'bg-sky-300',
};

function getServiceDotColor(service: string) {
  return SERVICE_COLORS[service] || 'bg-on-surface-variant';
}

interface TransactionTableProps {
  transactions: Transaction[];
}

export default function TransactionTable({
  transactions,
}: TransactionTableProps) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="section-header text-sm text-on-surface-variant whitespace-nowrap">
          Recent Transactions
        </h2>
        <div className="h-[1px] w-full bg-outline" />
      </div>

      <div className="bg-surface border border-outline overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container border-b border-outline">
              <th className="px-6 py-3 section-header text-[10px] text-on-surface-variant">
                Timestamp
              </th>
              <th className="px-6 py-3 section-header text-[10px] text-on-surface-variant">
                Service
              </th>
              <th className="px-6 py-3 section-header text-[10px] text-on-surface-variant">
                Module
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant text-center">
                Rail
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant text-center">
                Method
              </th>
              <th className="px-6 py-3 section-header text-[10px] text-on-surface-variant text-right">
                Cost
              </th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-on-surface-variant text-sm"
                >
                  No transactions yet
                </td>
              </tr>
            ) : (
              transactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`hover:bg-surface-container ${
                    i < transactions.length - 1
                      ? 'border-b border-outline/50'
                      : ''
                  }`}
                >
                  <td className="px-6 py-4 font-mono text-on-surface-variant">
                    {formatTxnTimestamp(tx.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${getServiceDotColor(tx.service)}`}
                      />
                      <span className="font-bold text-white">{tx.service}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant uppercase">
                    {tx.module}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <RailIcon rail={tx.rail} />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <MethodIcon method={tx.via} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-primary">
                    ${tx.costUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
