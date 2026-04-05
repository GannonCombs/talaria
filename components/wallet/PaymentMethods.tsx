import { Zap, CreditCard } from 'lucide-react';

export default function PaymentMethods() {
  return (
    <div className="bg-surface-container-low border border-outline p-5">
      <h3 className="section-header text-xs text-on-surface-variant mb-4">
        Payment Methods
      </h3>
      <div className="space-y-3">
        {/* Tempo — active */}
        <div className="flex items-center justify-between p-3 border border-primary bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-primary" />
            <span className="text-sm font-medium text-on-surface">
              Tempo Wallet
            </span>
          </div>
          <span className="section-header text-[10px] text-primary px-2 py-0.5 border border-primary">
            Active
          </span>
        </div>

        {/* Card — coming soon */}
        <div className="flex items-center justify-between p-3 border border-outline opacity-50">
          <div className="flex items-center gap-3">
            <CreditCard size={18} className="text-on-surface-variant" />
            <span className="text-sm font-medium text-on-surface-variant">
              Add Card
            </span>
          </div>
          <span className="section-header text-[10px] text-on-surface-variant px-2 py-0.5 border border-outline">
            Soon
          </span>
        </div>
      </div>
    </div>
  );
}
