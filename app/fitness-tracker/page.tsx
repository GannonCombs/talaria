'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import BackButton from '@/components/layout/BackButton';
import { Plus, Flag, RotateCcw, Dumbbell, Check } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────── */

interface SplitExercise { name: string; sets: number; reps: number; weight: number; }
interface Split { id: number; name: string; muscle_groups: string[]; rotation_order: number; exercises: SplitExercise[]; }
interface ActiveSet { reps: number; weight: number; confirmed: boolean; }
interface ActiveExercise { name: string; sets: ActiveSet[]; }
interface WorkoutLog { id: number; date: string; type: string; activity: string; split_name: string | null; duration_minutes: number | null; distance_miles: number | null; notes: string | null; }

type PageState = 'idle' | 'active' | 'cardio';

/* ── SetBubble component with hold-drag ───────────────────────────── */

function SetBubble({
  set, onConfirm, onUpdate, onEdit, isEditing, editReps, editWeight, onEditRepsChange, onEditWeightChange, onEditSave,
}: {
  set: ActiveSet;
  onConfirm: () => void;
  onUpdate: (field: 'weight' | 'reps', value: number) => void;
  onEdit: () => void;
  isEditing: boolean;
  editReps: string;
  editWeight: string;
  onEditRepsChange: (v: string) => void;
  onEditWeightChange: (v: string) => void;
  onEditSave: () => void;
}) {
  const [dragging, setDragging] = useState<'weight' | 'reps' | 'pending' | null>(null);
  const [dragValue, setDragValue] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; weight: number; reps: number; moved: boolean }>({ x: 0, y: 0, weight: 0, reps: 0, moved: false });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (set.confirmed) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, weight: set.weight, reps: set.reps, moved: false };

    timerRef.current = setTimeout(() => {
      setDragging('pending');
      setDragValue(0);
    }, 280);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Cancel long-press if moved too much before timer
    if (!dragging && dist > 10) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      startRef.current.moved = true;
      return;
    }

    if (!dragging) return;

    // Lock axis on first significant movement
    if (dragging === 'pending' && dist > 8) {
      setDragging(Math.abs(dy) > Math.abs(dx) ? 'weight' : 'reps');
      return;
    }

    if (dragging === 'weight') {
      const delta = Math.round(-dy / 30) * 5;
      const newWeight = Math.max(0, startRef.current.weight + delta);
      setDragValue(newWeight);
      onUpdate('weight', newWeight);
    } else if (dragging === 'reps') {
      const delta = Math.round(dx / 25);
      const newReps = Math.max(1, startRef.current.reps + delta);
      setDragValue(newReps);
      onUpdate('reps', newReps);
    }
  };

  const handlePointerUp = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    if (dragging) {
      setDragging(null);
      return;
    }

    // If we didn't drag and didn't move much, it's a tap → confirm
    if (!startRef.current.moved) {
      onConfirm();
    }
    startRef.current.moved = false;
  };

  // Editing mode (double-tap fallback)
  if (isEditing) {
    return (
      <div className="flex flex-col items-center gap-1 w-16">
        <div className="w-[52px] h-[52px] rounded-full border-2 border-primary bg-surface-container-lowest flex flex-col items-center justify-center">
          <input type="number" inputMode="numeric" value={editWeight} onChange={(e) => onEditWeightChange(e.target.value)}
            className="w-10 text-center text-sm font-mono font-bold bg-transparent text-on-surface outline-none" autoFocus />
          <div className="w-6 h-px bg-outline" />
          <input type="number" inputMode="numeric" value={editReps} onChange={(e) => onEditRepsChange(e.target.value)}
            className="w-10 text-center text-[10px] font-mono bg-transparent text-on-surface-variant outline-none" />
        </div>
        <button onClick={onEditSave} className="text-[10px] text-primary font-bold">OK</button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-1.5 w-16 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => !set.confirmed && onEdit()}
    >
      {/* Drag axis label */}
      {dragging && dragging !== 'pending' && (
        <span className="text-[9px] font-mono font-bold text-primary uppercase tracking-wider -mb-1">
          {dragging === 'weight' ? 'WT' : 'REPS'}
        </span>
      )}

      <div className={`relative w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-100 ${
        dragging ? 'scale-110 border-2 border-primary shadow-[0_0_12px_rgba(70,241,197,0.3)]' :
        set.confirmed ? 'bg-primary/20 border-2 border-primary' :
        'bg-surface-container-low border border-outline-variant/40 hover:border-primary/50'
      }`}>
        <span className={`font-mono font-bold text-lg leading-none ${
          set.confirmed ? 'text-primary' : 'text-on-surface'
        } ${!set.confirmed && !dragging ? 'opacity-70' : ''}`}>
          {dragging === 'weight' ? dragValue : (set.weight > 0 ? set.weight : 10)}
        </span>

        {set.confirmed && !dragging && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
            <Check size={9} className="text-on-primary" strokeWidth={3} />
          </div>
        )}
      </div>

      <span className={`font-mono text-xs leading-none ${
        dragging === 'reps' ? 'text-primary font-bold' : 'text-on-surface-variant'
      }`}>
        {dragging === 'reps' ? dragValue : set.reps} reps
      </span>

      {!dragging && (
        <span className="text-[8px] text-on-surface-variant/40 leading-none">
          {!set.confirmed ? 'hold to adj' : ''}
        </span>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export default function FitnessTrackerPage() {
  const [splits, setSplits] = useState<Split[]>([]);
  const [currentSplitIndex, setCurrentSplitIndex] = useState(0);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [activeSplit, setActiveSplit] = useState<Split | null>(null);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [editingSet, setEditingSet] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [saving, setSaving] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [cardioStatus, setCardioStatus] = useState('');

  useEffect(() => {
    fetch('/api/fitness/splits').then((r) => r.json()).then((d) => { setSplits(d.splits); setCurrentSplitIndex(d.currentSplitIndex ?? 0); }).catch(() => {});
    fetch('/api/fitness/workouts').then((r) => r.json()).then(setWorkouts).catch(() => {});
  }, []);

  const todaySplit = splits[currentSplitIndex] ?? null;

  // ── Start workout (with last-workout prefill) ──

  const startWorkout = useCallback(async (split: Split) => {
    try {
      // Start the workout
      const res = await fetch('/api/fitness/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', splitId: split.id, splitName: split.name }),
      });
      const data = await res.json();
      setWorkoutId(data.workoutId);
      setActiveSplit(split);
      setStartedAt(data.startedAt);

      // Try to load last workout for this split
      let lastExercises: Array<{ name: string; sets: Array<{ reps: number; weight: number }> }> | null = null;
      try {
        const lastRes = await fetch(`/api/fitness/last-workout?splitId=${split.id}`);
        const lastData = await lastRes.json();
        lastExercises = lastData.exercises;
      } catch {}

      // Build exercises: prefer last workout data, fall back to template
      const activeExercises = split.exercises.map((templateEx) => {
        const lastEx = lastExercises?.find((le) => le.name === templateEx.name);
        if (lastEx && lastEx.sets.length > 0) {
          return {
            name: templateEx.name,
            sets: lastEx.sets.map((s) => ({ reps: s.reps, weight: s.weight, confirmed: false })),
          };
        }
        return {
          name: templateEx.name,
          sets: Array.from({ length: templateEx.sets }, () => ({
            reps: templateEx.reps,
            weight: templateEx.weight,
            confirmed: false,
          })),
        };
      });

      setExercises(activeExercises);
      setPageState('active');
    } catch (err) {
      console.error('Failed to start workout:', err);
    }
  }, []);

  // ── Set operations ──

  const confirmSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => { const next = [...prev]; const ex = { ...next[exIdx], sets: [...next[exIdx].sets] }; ex.sets[setIdx] = { ...ex.sets[setIdx], confirmed: true }; next[exIdx] = ex; return next; });
  };

  const updateSetField = (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: number) => {
    setExercises((prev) => { const next = [...prev]; const ex = { ...next[exIdx], sets: [...next[exIdx].sets] }; ex.sets[setIdx] = { ...ex.sets[setIdx], [field]: value }; next[exIdx] = ex; return next; });
  };

  const openEdit = (exIdx: number, setIdx: number) => {
    const s = exercises[exIdx].sets[setIdx]; if (s.confirmed) return;
    setEditingSet({ exIdx, setIdx }); setEditWeight(String(s.weight)); setEditReps(String(s.reps));
  };

  const saveEdit = () => {
    if (!editingSet) return; const { exIdx, setIdx } = editingSet;
    setExercises((prev) => { const next = [...prev]; const ex = { ...next[exIdx], sets: [...next[exIdx].sets] }; ex.sets[setIdx] = { ...ex.sets[setIdx], weight: parseFloat(editWeight) || 0, reps: parseInt(editReps, 10) || 0 }; next[exIdx] = ex; return next; });
    setEditingSet(null);
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) => { const next = [...prev]; const ex = { ...next[exIdx], sets: [...next[exIdx].sets] }; const last = ex.sets[ex.sets.length - 1]; ex.sets.push({ reps: last?.reps ?? 10, weight: last?.weight ?? 0, confirmed: false }); next[exIdx] = ex; return next; });
  };

  // ── Finish workout ──

  const finishWorkout = async () => {
    if (!workoutId) return; setSaving(true);
    try {
      await fetch('/api/fitness/workout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finish', workoutId, exercises: exercises.map((ex, i) => ({ exercise_name: ex.name, sort_order: i, sets: ex.sets.filter((s) => s.confirmed).map((s, j) => ({ set_number: j + 1, weight: s.weight, reps: s.reps })) })) }) });
      const [splitsRes, workoutsRes] = await Promise.all([fetch('/api/fitness/splits').then((r) => r.json()), fetch('/api/fitness/workouts').then((r) => r.json())]);
      setSplits(splitsRes.splits); setCurrentSplitIndex(splitsRes.currentSplitIndex ?? 0); setWorkouts(workoutsRes);
      setPageState('idle'); setWorkoutId(null); setActiveSplit(null); setExercises([]);
    } finally { setSaving(false); }
  };

  // ── Save cardio ──

  const saveCardio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setCardioStatus('Saving...');
    try {
      const res = await fetch('/api/fitness/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity: data.get('activity') ?? 'run', duration_minutes: (data.get('duration') || data.get('seconds')) ? (parseFloat(data.get('duration') as string || '0') + parseFloat(data.get('seconds') as string || '0') / 60) : null, distance_miles: data.get('distance') ? parseFloat(data.get('distance') as string) : null, notes: data.get('notes') || null }) });
      if (res.ok) { const saved = await res.json(); setWorkouts((prev) => [saved, ...prev]); form.reset(); setCardioStatus('Saved!'); setPageState('idle'); setTimeout(() => setCardioStatus(''), 2000); }
    } catch { setCardioStatus('Error'); }
  };

  const elapsed = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000) : 0;

  // ══════════════════════════════════════════════════════════════════
  // ACTIVE SESSION
  // ══════════════════════════════════════════════════════════════════
  if (pageState === 'active' && activeSplit) {
    const confirmedCount = exercises.reduce((s, ex) => s + ex.sets.filter((st) => st.confirmed).length, 0);
    const totalCount = exercises.reduce((s, ex) => s + ex.sets.length, 0);

    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-on-surface">{activeSplit.name} Day</h1>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">
              {elapsed} min · {confirmedCount}/{totalCount} sets
            </p>
          </div>
          <button onClick={finishWorkout} disabled={saving || confirmedCount === 0}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 text-sm font-bold hover:brightness-110 disabled:opacity-40">
            <Flag size={14} strokeWidth={2.5} />
            {saving ? 'Saving...' : 'Finish'}
          </button>
        </div>

        <div className="space-y-4">
          {exercises.map((ex, exIdx) => (
            <div key={exIdx} className="bg-surface-container-low border border-outline p-4">
              <div className="flex items-center gap-2 mb-4">
                <Dumbbell size={16} className="text-primary" strokeWidth={1.5} />
                <span className="text-sm font-bold text-on-surface">{ex.name}</span>
              </div>

              <div className="flex flex-wrap gap-3 items-start">
                {ex.sets.map((set, setIdx) => (
                  <SetBubble
                    key={setIdx}
                    set={set}
                    onConfirm={() => confirmSet(exIdx, setIdx)}
                    onUpdate={(field, value) => updateSetField(exIdx, setIdx, field, value)}
                    onEdit={() => openEdit(exIdx, setIdx)}
                    isEditing={editingSet?.exIdx === exIdx && editingSet?.setIdx === setIdx}
                    editReps={editReps}
                    editWeight={editWeight}
                    onEditRepsChange={setEditReps}
                    onEditWeightChange={setEditWeight}
                    onEditSave={saveEdit}
                  />
                ))}

                <div className="flex flex-col items-center w-16">
                  <button onClick={() => addSet(exIdx)}
                    className="w-[52px] h-[52px] rounded-full border-2 border-dashed border-outline-variant/50 flex items-center justify-center text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                    <Plus size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-on-surface-variant text-center mt-4">
          Tap to confirm · Hold + drag to adjust · Double-tap for precise edit
        </p>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // CARDIO FORM
  // ══════════════════════════════════════════════════════════════════
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
              <option value="run">Run</option><option value="walk">Walk</option><option value="bike">Bike</option><option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Minutes</label><input type="number" name="duration" inputMode="numeric" placeholder="25" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Seconds</label><input type="number" name="seconds" inputMode="numeric" min="0" max="59" placeholder="30" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Miles</label><input type="number" name="distance" inputMode="decimal" step="any" placeholder="2.5" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
          </div>
          <div className="mb-5"><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Notes</label><input type="text" name="notes" placeholder="How'd it go?" className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none" /></div>
          <button type="submit" className="w-full bg-primary text-on-primary px-6 py-4 text-base font-bold">Save</button>
          {cardioStatus && <p className="text-center text-sm text-primary mt-3 font-mono">{cardioStatus}</p>}
        </form>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // IDLE — Split selection + history
  // ══════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BackButton />
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Fitness</h1>
        </div>
      </div>

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
                <span className="font-mono text-[10px] ml-auto">{ex.sets}×{ex.reps} @ {ex.weight || 10}</span>
              </div>
            ))}
          </div>
          <button onClick={() => startWorkout(todaySplit)} className="w-full bg-primary text-on-primary py-3 text-sm font-bold hover:brightness-110">
            Start Workout
          </button>
          <div className="flex gap-2 mt-3">
            {splits.length > 1 && (
              <button onClick={() => setCurrentSplitIndex((currentSplitIndex + 1) % splits.length)}
                className="flex-1 py-2 text-xs font-bold border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Swap Split
              </button>
            )}
            <button onClick={() => setPageState('cardio')}
              className="flex-1 py-2 text-xs font-bold border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors">
              Log Cardio
            </button>
          </div>
        </div>
      )}

      {workouts.length > 0 && (
        <div>
          <h3 className="text-xs text-on-surface-variant section-header mb-3">Recent</h3>
          <div className="space-y-1">
            {workouts.map((w) => (
              <div key={w.id} className="bg-surface-container-low border border-outline px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-on-surface capitalize">{w.split_name ? `${w.split_name} Day` : w.activity}</span>
                  <span className="text-[10px] text-on-surface-variant font-mono ml-2">{w.date}</span>
                  {w.notes && <p className="text-xs text-on-surface-variant/70 mt-0.5 italic">{w.notes}</p>}
                </div>
                <div className="text-right text-xs font-mono text-on-surface-variant">
                  {w.type === 'weights' ? <span className="text-primary">weights</span> : <>{w.duration_minutes && <span>{Math.round(w.duration_minutes)} min</span>}{w.distance_miles && <span className="ml-2">{w.distance_miles} mi</span>}</>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
