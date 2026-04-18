'use client';

import { useState, useEffect, useCallback } from 'react';
import BackButton from '@/components/layout/BackButton';
import { BookOpen, Plus, Flag, RotateCcw, Dumbbell } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────── */

interface SplitExercise {
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

interface Split {
  id: number;
  name: string;
  muscle_groups: string[];
  rotation_order: number;
  exercises: SplitExercise[];
}

interface ActiveSet {
  reps: number;
  weight: number;
  confirmed: boolean;
}

interface ActiveExercise {
  name: string;
  sets: ActiveSet[];
}

interface WorkoutLog {
  id: number;
  date: string;
  type: string;
  activity: string;
  split_name: string | null;
  duration_minutes: number | null;
  distance_miles: number | null;
  notes: string | null;
}

type PageState = 'idle' | 'active' | 'cardio';

/* ── Component ────────────────────────────────────────────────────── */

export default function FitnessTrackerPage() {
  // Split data
  const [splits, setSplits] = useState<Split[]>([]);
  const [currentSplitIndex, setCurrentSplitIndex] = useState(0);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);

  // Active session state
  const [pageState, setPageState] = useState<PageState>('idle');
  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [activeSplit, setActiveSplit] = useState<Split | null>(null);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [editingSet, setEditingSet] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [saving, setSaving] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  // Cardio form
  const [cardioActivity, setCardioActivity] = useState('run');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioSeconds, setCardioSeconds] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');
  const [cardioStatus, setCardioStatus] = useState('');

  // Load splits + history
  useEffect(() => {
    fetch('/api/fitness/splits')
      .then((r) => r.json())
      .then((data) => {
        setSplits(data.splits);
        setCurrentSplitIndex(data.currentSplitIndex ?? 0);
      })
      .catch(() => {});

    fetch('/api/fitness/workouts')
      .then((r) => r.json())
      .then(setWorkouts)
      .catch(() => {});
  }, []);

  const todaySplit = splits[currentSplitIndex] ?? null;

  // ── Start workout ──

  const startWorkout = useCallback(async (split: Split) => {
    try {
      const res = await fetch('/api/fitness/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', splitId: split.id, splitName: split.name }),
      });
      const data = await res.json();
      setWorkoutId(data.workoutId);
      setActiveSplit(split);
      setStartedAt(data.startedAt);
      setExercises(
        split.exercises.map((ex) => ({
          name: ex.name,
          sets: Array.from({ length: ex.sets }, () => ({
            reps: ex.reps,
            weight: ex.weight,
            confirmed: false,
          })),
        }))
      );
      setPageState('active');
    } catch (err) {
      console.error('Failed to start workout:', err);
    }
  }, []);

  // ── Confirm a set ──

  const confirmSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
      ex.sets[setIdx] = { ...ex.sets[setIdx], confirmed: true };
      next[exIdx] = ex;
      return next;
    });
  };

  // ── Open edit for a set ──

  const openEdit = (exIdx: number, setIdx: number) => {
    const s = exercises[exIdx].sets[setIdx];
    if (s.confirmed) return;
    setEditingSet({ exIdx, setIdx });
    setEditWeight(String(s.weight));
    setEditReps(String(s.reps));
  };

  const saveEdit = () => {
    if (!editingSet) return;
    const { exIdx, setIdx } = editingSet;
    setExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
      ex.sets[setIdx] = {
        ...ex.sets[setIdx],
        weight: parseFloat(editWeight) || 0,
        reps: parseInt(editReps, 10) || 0,
      };
      next[exIdx] = ex;
      return next;
    });
    setEditingSet(null);
  };

  // ── Add set to exercise ──

  const addSet = (exIdx: number) => {
    setExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push({ reps: last?.reps ?? 10, weight: last?.weight ?? 0, confirmed: false });
      next[exIdx] = ex;
      return next;
    });
  };

  // ── Finish workout ──

  const finishWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      const payload = {
        action: 'finish',
        workoutId,
        exercises: exercises.map((ex, i) => ({
          exercise_name: ex.name,
          sort_order: i,
          sets: ex.sets
            .filter((s) => s.confirmed)
            .map((s, j) => ({
              set_number: j + 1,
              weight: s.weight,
              reps: s.reps,
            })),
        })),
      };
      await fetch('/api/fitness/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Refresh data
      const [splitsRes, workoutsRes] = await Promise.all([
        fetch('/api/fitness/splits').then((r) => r.json()),
        fetch('/api/fitness/workouts').then((r) => r.json()),
      ]);
      setSplits(splitsRes.splits);
      setCurrentSplitIndex(splitsRes.currentSplitIndex ?? 0);
      setWorkouts(workoutsRes);

      setPageState('idle');
      setWorkoutId(null);
      setActiveSplit(null);
      setExercises([]);
    } finally {
      setSaving(false);
    }
  };

  // ── Save cardio ──

  const saveCardio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setCardioStatus('Saving...');
    try {
      const res = await fetch('/api/fitness/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: data.get('activity') ?? 'run',
          duration_minutes: (data.get('duration') || data.get('seconds'))
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
        setCardioStatus('Saved!');
        setPageState('idle');
        setTimeout(() => setCardioStatus(''), 2000);
      }
    } catch {
      setCardioStatus('Error');
    }
  };

  // ── Elapsed time ──

  const elapsed = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000)
    : 0;

  // ── Render ─────────────────────────────────────────────────────── */

  // ACTIVE SESSION
  if (pageState === 'active' && activeSplit) {
    const confirmedCount = exercises.reduce((s, ex) => s + ex.sets.filter((st) => st.confirmed).length, 0);
    const totalCount = exercises.reduce((s, ex) => s + ex.sets.length, 0);

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-on-surface">{activeSplit.name} Day</h1>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">
              {elapsed} min · {confirmedCount}/{totalCount} sets
            </p>
          </div>
          <button
            onClick={finishWorkout}
            disabled={saving || confirmedCount === 0}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 text-sm font-bold hover:brightness-110 disabled:opacity-40"
          >
            <Flag size={14} strokeWidth={2.5} />
            {saving ? 'Saving...' : 'Finish'}
          </button>
        </div>

        {/* Exercise cards */}
        <div className="space-y-4">
          {exercises.map((ex, exIdx) => (
            <div
              key={exIdx}
              className="bg-surface-container-low border border-outline p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell size={16} className="text-primary" strokeWidth={1.5} />
                <span className="text-sm font-bold text-on-surface">{ex.name}</span>
              </div>

              <div className="flex flex-wrap gap-3">
                {ex.sets.map((set, setIdx) => {
                  const isEditing = editingSet?.exIdx === exIdx && editingSet?.setIdx === setIdx;

                  if (isEditing) {
                    return (
                      <div key={setIdx} className="flex flex-col items-center gap-1">
                        <div className="w-14 h-14 border-2 border-primary bg-surface-container-lowest flex flex-col items-center justify-center p-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editReps}
                            onChange={(e) => setEditReps(e.target.value)}
                            className="w-full text-center text-sm font-mono bg-transparent text-on-surface outline-none"
                            autoFocus
                          />
                          <div className="w-8 h-px bg-outline my-0.5" />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editWeight}
                            onChange={(e) => setEditWeight(e.target.value)}
                            className="w-full text-center text-[10px] font-mono bg-transparent text-on-surface-variant outline-none"
                          />
                        </div>
                        <button
                          onClick={saveEdit}
                          className="text-[10px] text-primary font-bold"
                        >
                          OK
                        </button>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={setIdx}
                      onClick={() => set.confirmed ? undefined : confirmSet(exIdx, setIdx)}
                      onDoubleClick={() => !set.confirmed && openEdit(exIdx, setIdx)}
                      className={`w-14 h-14 flex flex-col items-center justify-center border-2 transition-all duration-75 ${
                        set.confirmed
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-surface-container-lowest border-outline text-on-surface hover:border-primary/50'
                      }`}
                    >
                      <span className="text-sm font-mono font-bold leading-none">{set.reps}</span>
                      <span className="text-[10px] font-mono leading-none mt-0.5 opacity-70">
                        {set.weight > 0 ? set.weight : 'BW'}
                      </span>
                    </button>
                  );
                })}

                {/* Add set */}
                <button
                  onClick={() => addSet(exIdx)}
                  className="w-14 h-14 flex items-center justify-center border-2 border-dashed border-outline text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Edit hint */}
        <p className="text-[10px] text-on-surface-variant text-center mt-4">
          Tap to confirm · Double-tap to edit weight/reps
        </p>
      </>
    );
  }

  // CARDIO FORM
  if (pageState === 'cardio') {
    return (
      <>
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setPageState('idle')} className="text-on-surface-variant hover:text-white">
              <RotateCcw size={20} />
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">Log Cardio</h1>
          </div>
        </div>

        <form onSubmit={saveCardio} className="bg-surface-container-low border border-outline p-5 mb-6">
          <div className="mb-4">
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Activity</label>
            <select name="activity" defaultValue="run" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none">
              <option value="run">Run</option>
              <option value="walk">Walk</option>
              <option value="bike">Bike</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Minutes</label>
              <input type="number" name="duration" inputMode="numeric" placeholder="25" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Seconds</label>
              <input type="number" name="seconds" inputMode="numeric" min="0" max="59" placeholder="30" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Miles</label>
              <input type="number" name="distance" inputMode="decimal" step="any" placeholder="2.5" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" />
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Notes</label>
            <input type="text" name="notes" placeholder="How'd it go?" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none" />
          </div>
          <button type="submit" className="w-full bg-primary text-on-primary px-6 py-4 text-base font-bold">Save</button>
          {cardioStatus && <p className="text-center text-sm text-primary mt-3 font-mono">{cardioStatus}</p>}
        </form>
      </>
    );
  }

  // IDLE — Split selection + history
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BackButton />
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Fitness</h1>
        </div>
      </div>

      {/* Today's split */}
      {todaySplit && (
        <div className="bg-surface-container-low border border-outline p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] text-on-surface-variant section-header">Today</p>
              <h2 className="text-xl font-bold text-on-surface">{todaySplit.name} Day</h2>
            </div>
            <Dumbbell size={24} className="text-primary" strokeWidth={1.5} />
          </div>

          <div className="space-y-1 mb-5">
            {todaySplit.exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-on-surface-variant">
                <div className="w-1.5 h-1.5 bg-primary" />
                <span>{ex.name}</span>
                <span className="font-mono text-[10px] ml-auto">{ex.sets}×{ex.reps} @ {ex.weight || 'BW'}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => startWorkout(todaySplit)}
            className="w-full bg-primary text-on-primary py-3 text-sm font-bold hover:brightness-110"
          >
            Start Workout
          </button>

          <div className="flex gap-2 mt-3">
            {splits.length > 1 && (
              <button
                onClick={() => {
                  const nextIdx = (currentSplitIndex + 1) % splits.length;
                  setCurrentSplitIndex(nextIdx);
                }}
                className="flex-1 py-2 text-xs font-bold border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Swap Split
              </button>
            )}
            <button
              onClick={() => setPageState('cardio')}
              className="flex-1 py-2 text-xs font-bold border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Log Cardio
            </button>
          </div>
        </div>
      )}

      {/* Workout history */}
      {workouts.length > 0 && (
        <div>
          <h3 className="text-xs text-on-surface-variant section-header mb-3">Recent</h3>
          <div className="space-y-1">
            {workouts.map((w) => (
              <div key={w.id} className="bg-surface-container-low border border-outline px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-on-surface capitalize">
                    {w.split_name ? `${w.split_name} Day` : w.activity}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-mono ml-2">{w.date}</span>
                  {w.notes && <p className="text-xs text-on-surface-variant/70 mt-0.5 italic">{w.notes}</p>}
                </div>
                <div className="text-right text-xs font-mono text-on-surface-variant">
                  {w.type === 'weights' ? (
                    <span className="text-primary">weights</span>
                  ) : (
                    <>
                      {w.duration_minutes && <span>{Math.round(w.duration_minutes)} min</span>}
                      {w.distance_miles && <span className="ml-2">{w.distance_miles} mi</span>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
