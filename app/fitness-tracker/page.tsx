'use client';

import BackButton from '@/components/layout/BackButton';

export default function FitnessTrackerPage() {
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Fitness Tracker
          </h1>
        </div>
      </div>

      <div className="border border-outline bg-surface-container-low p-8 text-center text-on-surface-variant">
        Coming soon
      </div>
    </>
  );
}
