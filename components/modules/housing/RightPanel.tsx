'use client';

interface RateData {
  rate: number;
  apr: number;
  product: string;
}

interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
}

interface MarketStats {
  medianPrice: number;
  medianPpsf: number;
  activeListings: number;
  medianDom: number;
}

interface TopListing {
  id: number;
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dealScore: number | null;
}

interface RightPanelProps {
  rates: RateData[];
  prediction: FedPrediction | null;
  marketStats: MarketStats | null;
  topListings: TopListing[];
  onListingClick?: (id: number) => void;
}

const TERM_LABELS: Record<string, string> = {
  '30yr_fixed': '30 yr',
  '20yr_fixed': '20 yr',
  '15yr_fixed': '15 yr',
  '10yr_fixed': '10 yr',
};

const TERM_ORDER = ['30yr_fixed', '20yr_fixed', '15yr_fixed', '10yr_fixed'];

export default function RightPanel({
  rates,
  prediction,
  marketStats,
  topListings,
  onListingClick,
}: RightPanelProps) {
  // Best rate per term, sorted by term order
  const bestByTerm = new Map<string, RateData>();
  for (const r of rates) {
    if (!bestByTerm.has(r.product) || r.rate < bestByTerm.get(r.product)!.rate) {
      bestByTerm.set(r.product, r);
    }
  }
  const sortedRates = TERM_ORDER
    .filter((t) => bestByTerm.has(t))
    .map((t) => bestByTerm.get(t)!);

  return (
    <div className="h-full overflow-y-auto border-l border-outline bg-background p-4 space-y-4">
      {/* Rate Watch */}
      <section className="bg-surface-container-low border border-outline p-4">
        <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
          Rate Watch
        </h3>
        {sortedRates.length === 0 ? (
          <div className="text-on-surface-variant text-xs">No rate data</div>
        ) : (
          <div className="space-y-2">
            {sortedRates.map((r) => (
              <div key={r.product} className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant w-12">
                  {TERM_LABELS[r.product] ?? r.product}
                </span>
                <div className="flex-1 mx-3 h-1 bg-surface-container-highest">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, (r.rate / 8) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-sm font-bold text-on-surface w-16 text-right">
                  {r.rate}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fed Forecast */}
      <section className="bg-surface-container-low border border-outline p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="section-header text-[10px] text-on-surface-variant">
            Fed Forecast
          </h3>
          <span className="text-[9px] font-mono text-on-surface-variant">
            {prediction ? `${Math.round(prediction.cutProb * 100)}%` : '—'}
          </span>
        </div>

        {prediction ? (
          <>
            {/* Probability bar */}
            <div className="flex h-4 overflow-hidden border border-outline">
              <div
                className="bg-secondary flex items-center justify-center"
                style={{ width: `${prediction.cutProb * 100}%` }}
              >
                <span className="text-[8px] font-bold text-on-primary">
                  CUT {Math.round(prediction.cutProb * 100)}%
                </span>
              </div>
              <div
                className="bg-surface-container-highest flex items-center justify-center"
                style={{ width: `${prediction.holdProb * 100}%` }}
              >
                <span className="text-[8px] font-bold text-on-surface-variant">
                  HOLD {Math.round(prediction.holdProb * 100)}%
                </span>
              </div>
              <div
                className="bg-error flex items-center justify-center"
                style={{ width: `${prediction.hikeProb * 100}%` }}
              >
                {prediction.hikeProb > 0.05 && (
                  <span className="text-[8px] font-bold text-on-primary">
                    HIKE
                  </span>
                )}
              </div>
            </div>
            <div className="text-[9px] text-on-surface-variant font-mono mt-1">
              Next FOMC: {prediction.meetingDate}
            </div>
          </>
        ) : (
          <div className="text-on-surface-variant text-xs">No data</div>
        )}
      </section>

      {/* Market Trends */}
      <section className="bg-surface-container-low border border-outline p-4">
        <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
          Market Trends (78745+)
        </h3>

        {marketStats ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] text-on-surface-variant section-header block">
                Median Price
              </span>
              <span className="font-mono text-sm font-bold text-on-surface">
                ${(marketStats.medianPrice / 1000).toFixed(1)}K
              </span>
            </div>
            <div>
              <span className="text-[9px] text-on-surface-variant section-header block">
                $/Sqft
              </span>
              <span className="font-mono text-sm font-bold text-on-surface">
                ${marketStats.medianPpsf.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-on-surface-variant section-header block">
                Active Listings
              </span>
              <span className="font-mono text-sm font-bold text-on-surface">
                {marketStats.activeListings}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-on-surface-variant section-header block">
                Avg DOM
              </span>
              <span className="font-mono text-sm font-bold text-on-surface">
                {marketStats.medianDom} Days
              </span>
            </div>
          </div>
        ) : (
          <div className="text-on-surface-variant text-xs">No data</div>
        )}
      </section>

      {/* High Score Alerts / Top Matches */}
      <section className="bg-surface-container-low border border-outline p-4">
        <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
          High Score Alerts
        </h3>

        {topListings.length === 0 ? (
          <div className="text-on-surface-variant text-xs">
            Run analysis to see top matches
          </div>
        ) : (
          <div className="space-y-2">
            {topListings.map((listing) => (
              <button
                key={listing.id}
                onClick={() => onListingClick?.(listing.id)}
                className="w-full flex items-start gap-3 p-2 border border-outline bg-surface-container-lowest hover:border-primary text-left"
              >
                {/* Placeholder image */}
                <div className="w-16 h-12 bg-surface-container-highest shrink-0 flex items-center justify-center">
                  <span className="text-[8px] text-on-surface-variant font-mono">
                    IMG
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-on-surface truncate">
                    {listing.address}
                  </div>
                  <div className="text-[10px] text-on-surface-variant font-mono">
                    {listing.beds}bd · {listing.baths}ba · {listing.sqft.toLocaleString()} sqft
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-mono text-xs font-bold text-primary">
                      ${listing.price.toLocaleString()}
                    </span>
                    {listing.dealScore !== null && (
                      <span className="font-mono text-[9px] text-tertiary-container font-bold">
                        SCORE {listing.dealScore}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
