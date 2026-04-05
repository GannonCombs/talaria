import { ArrowDownToLine, CreditCard, Landmark } from 'lucide-react';

export default function FundWallet() {
  return (
    <div className="bg-surface-container-low border border-outline p-8">
      <h3 className="section-header text-sm text-on-surface-variant mb-6">
        Fund Wallet
      </h3>
      <div className="space-y-4">
        <button className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left">
          <ArrowDownToLine size={20} />
          <div>
            <div className="text-base font-medium">Deposit Crypto</div>
            <div className="text-sm text-on-surface-variant">
              Receive to your wallet address
            </div>
          </div>
        </button>
        <button className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left">
          <CreditCard size={20} />
          <div>
            <div className="text-base font-medium">Add Card</div>
            <div className="text-sm text-on-surface-variant">
              Link a debit or credit card
            </div>
          </div>
        </button>
        <button className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left">
          <Landmark size={20} />
          <div>
            <div className="text-base font-medium">Connect Bank</div>
            <div className="text-sm text-on-surface-variant">
              Link a bank account
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
