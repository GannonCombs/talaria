'use client';

import { useState, useEffect } from 'react';
import BackButton from '@/components/layout/BackButton';

interface Workout {
  id: number;
  date: string;
  activity: string;
  duration_minutes: number | null;
  distance_miles: number | null;
  notes: string | null;
}

export default function FitnessTrackerPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/fitness/workouts')
      .then((r) => r.json())
      .then(setWorkouts)
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setStatus('Saving...');
    try {
      const res = await fetch('/api/fitness/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: data.get('activity') ?? 'run',
          duration_minutes: data.get('duration') || data.get('seconds')
            ? (parseFloat(data.get('duration') as string || '0') + parseFloat(data.get('seconds') as string || '0') / 60)
            : null,
          distance_miles: data.get('distance') ? parseFloat(data.get('distance') as string) : null,
          notes: data.get('notes') || null,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setWorkouts((prev) => [saved, ...prev]);
        form.reset();
        setStatus('Saved!');
        setTimeout(() => setStatus(''), 2000);
      } else {
        setStatus('Error saving');
      }
    } catch {
      setStatus('Error saving');
    }
  }

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Fitness</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline p-5 mb-6">
        <div className="mb-4">
          <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Activity</label>
          <select
            name="activity"
            defaultValue="run"
            className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="run">Run</option>
            <option value="walk">Walk</option>
            <option value="bike">Bike</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Minutes</label>
            <input
              type="number"
              name="duration"
              inputMode="numeric"
              placeholder="e.g. 25"
              className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Seconds</label>
            <input
              type="number"
              name="seconds"
              inputMode="numeric"
              min="0"
              max="59"
              placeholder="e.g. 30"
              className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Miles</label>
            <input
              type="number"
              name="distance"
              inputMode="decimal"
              step="any"
              placeholder="e.g. 2.5"
              className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Notes</label>
          <input
            type="text"
            name="notes"
            placeholder="How'd it go?"
            className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-primary text-on-primary px-6 py-4 text-base font-bold"
        >
          Save Workout
        </button>

        {status && (
          <p className="text-center text-sm text-primary mt-3 font-mono">{status}</p>
        )}
      </form>

      {workouts.length > 0 && (
        <div className="space-y-2">
          {workouts.map((w) => {
            const pace = w.duration_minutes && w.distance_miles && w.distance_miles > 0
              ? (() => { const p = w.duration_minutes! / w.distance_miles!; return `${Math.floor(p)}:${Math.round((p % 1) * 60).toString().padStart(2, '0')}/mi`; })()
              : null;
            return (
              <div key={w.id} className="bg-surface-container-low border border-outline p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-on-surface capitalize">{w.activity}</span>
                  <span className="text-[10px] text-on-surface-variant font-mono">{w.date}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
                  {w.duration_minutes && <span className="font-mono">{w.duration_minutes} min</span>}
                  {w.distance_miles && <span className="font-mono">{w.distance_miles} mi</span>}
                  {pace && <span className="font-mono text-primary">{pace}</span>}
                </div>
                {w.notes && <div className="text-xs text-on-surface-variant/70 mt-1 italic">{w.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
