'use client';

// Rail icons — Lucide for generic types
import { CreditCard, Zap, Landmark } from 'lucide-react';

// Method/brand icons — react-icons Simple Icons
import {
  SiVisa,
  SiStripe,
  SiBitcoin,
  SiEthereum,
  SiSolana,
  SiStellar,
} from 'react-icons/si';

// Tempo — custom asset provided in /assets/tempo.svg
function TempoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M21 21H3V3h18zM9.133 7.995c-.11 0-.206.07-.24.174l-.774 2.32a.133.133 0 0 0 .126.176h2.247c.09 0 .155.09.126.176l-1.663 4.988a.133.133 0 0 0 .127.176h2.409c.109 0 .206-.07.24-.173l1.665-4.994a.25.25 0 0 1 .24-.173h2.251c.11 0 .206-.07.24-.174l.774-2.32a.133.133 0 0 0-.126-.176z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Rail icon resolver ──
// Rails: card, bank, lightning, tempo, ethereum, solana, base, stellar

const ICON_SIZE = 18;

export function RailIcon({ rail }: { rail: string }) {
  switch (rail) {
    case 'card':
      return <CreditCard size={ICON_SIZE} className="text-on-surface" />;
    case 'bank':
      return <Landmark size={ICON_SIZE} className="text-on-surface" />;
    case 'lightning':
      return <Zap size={ICON_SIZE} className="text-on-surface" />;
    case 'tempo':
      return <TempoIcon size={ICON_SIZE} />;
    case 'ethereum':
      return <SiEthereum size={ICON_SIZE} className="text-on-surface" />;
    case 'solana':
      return <SiSolana size={ICON_SIZE} className="text-on-surface" />;
    case 'base':
      return <SiEthereum size={ICON_SIZE} className="text-on-surface" />;
    case 'stellar':
      return <SiStellar size={ICON_SIZE} className="text-on-surface" />;
    default:
      return <CreditCard size={ICON_SIZE} className="text-on-surface" />;
  }
}

// ── Method icon resolver ──
// Methods: visa, stripe, link, usdc, btc, eth, sol, xlm

export function MethodIcon({ method }: { method?: string }) {
  if (!method) return <span className="text-on-surface-variant">—</span>;

  switch (method) {
    case 'visa':
      return <SiVisa size={ICON_SIZE} className="text-on-surface" />;
    case 'stripe':
      return <SiStripe size={ICON_SIZE} className="text-on-surface" />;
    case 'btc':
      return <SiBitcoin size={ICON_SIZE} className="text-on-surface" />;
    case 'eth':
      return <SiEthereum size={ICON_SIZE} className="text-on-surface" />;
    case 'sol':
      return <SiSolana size={ICON_SIZE} className="text-on-surface" />;
    case 'xlm':
      return <SiStellar size={ICON_SIZE} className="text-on-surface" />;
    case 'usdc':
      // TODO: replace with proper USDC SVG from /assets when provided
      return <span className="text-on-surface font-mono text-xs font-bold">USDC</span>;
    case 'link':
      return <SiStripe size={ICON_SIZE} className="text-on-surface" />;
    default:
      return <span className="text-on-surface-variant">—</span>;
  }
}
