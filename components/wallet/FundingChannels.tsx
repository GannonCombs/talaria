import { Landmark, ArrowRightLeft, Waypoints } from 'lucide-react';

const CHANNELS = [
  {
    icon: Landmark,
    name: 'Coinbase',
    description: 'Direct on-ramp with',
    action: 'Connect',
    actionStyle: 'text-primary border-primary',
  },
  {
    icon: ArrowRightLeft,
    name: 'Exchange',
    description: 'Transfer from centralized CEX',
    action: 'Deposit',
    actionStyle: 'text-on-surface-variant border-outline',
  },
  {
    icon: Waypoints,
    name: 'Bridge',
    description: 'Cross-chain asset migration',
    action: 'Bridge',
    actionStyle: 'text-on-surface-variant border-outline',
  },
];

export default function FundingChannels() {
  return (
    <div className="bg-surface-container-low border border-outline p-5">
      <h3 className="section-header text-xs text-on-surface-variant mb-4">
        Funding Channels
      </h3>
      <div className="space-y-3">
        {CHANNELS.map((ch) => (
          <div
            key={ch.name}
            className="flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3">
              <ch.icon size={18} className="text-on-surface-variant" />
              <div>
                <div className="text-sm font-medium text-on-surface">
                  {ch.name}
                </div>
                <div className="text-[10px] text-on-surface-variant">
                  {ch.description}
                </div>
              </div>
            </div>
            <button
              className={`px-3 py-1 border text-xs section-header ${ch.actionStyle}`}
            >
              {ch.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
