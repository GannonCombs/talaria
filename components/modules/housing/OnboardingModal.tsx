'use client';

import { useState } from 'react';

interface OnboardingModalProps {
  onComplete: (city: string, state: string, creditScore: number) => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [creditScore, setCreditScore] = useState(780);

  const canSubmit = city.trim().length > 0 && state.trim().length === 2;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onComplete(city.trim(), state.trim().toUpperCase(), creditScore);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-outline max-w-md w-full shadow-2xl">
        <div className="p-5 border-b border-outline">
          <h2 className="text-lg font-bold text-on-surface tracking-tight">
            Set up Housing
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Choose your city and credit score. Talaria will pull live listing
            data for this area via RentCast (paid per-call, ~$0.33 per refresh).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">
              City
            </label>
            <input
              type="text"
              placeholder="e.g. Bellevue"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoFocus
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
          </div>

          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">
              State
            </label>
            <input
              type="text"
              placeholder="e.g. WA"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              className="w-20 bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
          </div>

          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">
              Credit Score
            </label>
            <select
              value={creditScore}
              onChange={(e) => setCreditScore(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={780}>780+ (Excellent)</option>
              <option value={740}>740–779 (Very Good)</option>
              <option value={700}>700–739 (Good)</option>
              <option value={660}>660–699 (Fair)</option>
              <option value={620}>620–659 (Poor)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-10 text-xs font-bold uppercase tracking-wider border border-primary text-primary hover:bg-primary hover:text-on-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Save &amp; Load Data
          </button>

          <p className="text-[10px] text-on-surface-variant text-center">
            You can change these later in Personal Details.
          </p>
        </form>
      </div>
    </div>
  );
}
