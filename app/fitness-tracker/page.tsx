'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import BackButton from '@/components/layout/BackButton';
import { Plus, Flag, RotateCcw, Dumbbell, Check, CalendarDays, TrendingUp, Pencil } from 'lucide-react';
import { DEMO_MODE } from '@/lib/config';
import SafeChart from '@/components/shared/SafeChart';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';

/* ── Types ────────────────────────────────────────────────────────── */

interface SplitExercise { name: string; sets: number; reps: number; weight: number; }
interface Split { id: number; name: string; muscle_groups: string[]; rotation_order: number; exercises: SplitExercise[]; }
interface ActiveSet { reps: number; weight: number; confirmed: boolean; }
interface ActiveExercise { name: string; sets: ActiveSet[]; }
interface WorkoutLog { id: number; date: string; type: string; activity: string; split_name: string | null; duration_minutes: number | null; distance_miles: number | null; reps: number | null; notes: string | null; score?: number; }

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

/* ── Score Timeline component ─────────────────────────────────────── */

function ScoreTimeline({ workouts }: { workouts: WorkoutLog[] }) {
  const [range, setRange] = useState<'1M' | '3M' | '6M'>('3M');

  const rangeDays = range === '1M' ? 30 : range === '3M' ? 90 : 180;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Filter to workouts with scores in range, sorted by date
  const scored = workouts
    .filter((w) => w.score != null && w.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (scored.length === 0) return null;

  // Compute 7-day rolling average
  const chartData = scored.map((w, i) => {
    const windowStart = Math.max(0, i - 6);
    const window = scored.slice(windowStart, i + 1);
    const avg = window.reduce((s, x) => s + (x.score ?? 0), 0) / window.length;
    return {
      date: w.date,
      score: w.score!,
      avg: +avg.toFixed(2),
      type: w.type,
    };
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const latestScore = chartData[chartData.length - 1]?.score ?? 0;
  const latestAvg = chartData[chartData.length - 1]?.avg ?? 0;

  return (
    <div className="bg-surface-container-low border border-outline p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" strokeWidth={1.5} />
          <span className="text-sm font-bold text-on-surface">Performance</span>
          <span className="text-xs text-on-surface-variant font-mono ml-2">
            {latestScore.toFixed(1)} latest · {latestAvg.toFixed(1)} avg
          </span>
        </div>
        <div className="flex gap-1">
          {(['1M', '3M', '6M'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                range === r
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <SafeChart className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#46f1c5" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#46f1c5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              tickCount={6}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-surface-container border border-outline px-3 py-2 text-xs">
                    <div className="font-mono text-on-surface-variant">{formatDate(d.date)}</div>
                    <div className="font-mono text-primary font-bold">{d.score.toFixed(2)}</div>
                    <div className="font-mono text-on-surface-variant">7d avg: {d.avg.toFixed(2)}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#46f1c5"
              strokeWidth={1.5}
              fill="url(#scoreGradient)"
              dot={{ r: 1.5, fill: '#46f1c5', strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#46f1c5', stroke: '#10141a', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="#8b949e"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </SafeChart>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] bg-primary" />
          Daily
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[2px] bg-on-surface-variant" style={{ borderTop: '1px dashed' }} />
          7D Avg
        </div>
      </div>
    </div>
  );
}

/* ── Demo data ────────────────────────────────────────────────────── */

function generateDemoWorkouts(): WorkoutLog[] {
  const demos: WorkoutLog[] = [];
  const today = new Date();
  const splits = ['Chest + Tri', 'Back + Bi', 'Legs'];
  let splitIdx = 0;
  let id = 1000;

  // Generate ~6 months of realistic workout history
  // Scores trend upward: ~3.5 at start → ~7.0 by today, with daily noise
  // Use a seeded-ish approach (deterministic per daysAgo) for stable renders
  for (let daysAgo = 180; daysAgo >= 0; daysAgo--) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().split('T')[0];
    const dow = d.getDay();

    // Deterministic "random" based on day number for stable renders
    const seed = (daysAgo * 7 + 13) % 100;

    // Rest on most Sundays and some Wednesdays
    if (dow === 0 && seed > 20) continue;
    if (dow === 3 && seed > 50) continue;

    // Random skip days (~15% chance)
    if (seed < 15 && dow !== 1 && dow !== 4) continue;

    // Progress factor: 0.0 at 180 days ago → 1.0 today
    const progress = (180 - daysAgo) / 180;

    // Saturday is often cardio
    if (dow === 6 && seed > 40) {
      const duration = 20 + (seed % 25);
      const cardioScore = +(2.5 + progress * 2.5 + (seed % 20 - 10) * 0.1).toFixed(2);
      demos.push({
        id: id++, date: dateStr, type: 'cardio', activity: 'run',
        split_name: null, duration_minutes: duration,
        distance_miles: +(1.5 + (seed % 30) * 0.08).toFixed(1), reps: null, notes: null,
        score: Math.max(1.5, Math.min(9.0, cardioScore)),
      });
      continue;
    }

    // Weights day — score trends up with noise
    const baseScore = 3.0 + progress * 3.5; // 3.0 → 6.5
    const noise = ((seed % 30) - 15) * 0.08; // ±1.2
    // Occasional great day (seed 90-99) or bad day (seed 0-5)
    const bonus = seed >= 93 ? 1.5 : seed <= 4 ? -1.5 : 0;
    const score = +(baseScore + noise + bonus).toFixed(2);

    demos.push({
      id: id++, date: dateStr, type: 'weights', activity: 'split',
      split_name: splits[splitIdx % 3], duration_minutes: null,
      distance_miles: null, reps: null, notes: null,
      score: Math.max(1.0, Math.min(9.5, score)),
    });
    splitIdx++;
  }

  return demos;
}

/* ── Heatmap component ────────────────────────────────────────────── */

function Heatmap({ workouts }: { workouts: WorkoutLog[] }) {
  // Build a map of date → workout type
  const dateMap = new Map<string, 'weights' | 'cardio'>();
  for (const w of workouts) {
    // First workout of the day wins (weights > cardio priority)
    const existing = dateMap.get(w.date);
    if (!existing || (w.type === 'weights' && existing === 'cardio')) {
      dateMap.set(w.date, w.type === 'weights' ? 'weights' : 'cardio');
    }
  }

  // Build 365 days ending today
  const today = new Date();
  const days: { date: string; type: 'weights' | 'cardio' | null; dayOfWeek: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      type: dateMap.get(dateStr) ?? null,
      dayOfWeek: d.getDay(),
    });
  }

  // Group into weeks (columns of 7)
  const weeks: typeof days[] = [];
  // Pad the first week so it starts on Sunday
  const firstDow = days[0].dayOfWeek;
  if (firstDow > 0) {
    const padded = Array.from({ length: firstDow }, () => ({ date: '', type: null as null, dayOfWeek: 0 }));
    const firstWeek = [...padded, ...days.slice(0, 7 - firstDow)];
    weeks.push(firstWeek);
    let idx = 7 - firstDow;
    while (idx < days.length) {
      weeks.push(days.slice(idx, idx + 7));
      idx += 7;
    }
  } else {
    let idx = 0;
    while (idx < days.length) {
      weeks.push(days.slice(idx, idx + 7));
      idx += 7;
    }
  }

  // Month labels
  const monthLabels: { label: string; weekIdx: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstReal = weeks[w].find((d) => d.date);
    if (firstReal?.date) {
      const month = new Date(firstReal.date).getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ label: new Date(firstReal.date).toLocaleString('en-US', { month: 'short' }), weekIdx: w });
        lastMonth = month;
      }
    }
  }

  function getCellColor(type: 'weights' | 'cardio' | null): string {
    if (!type) return 'bg-surface-container-high';
    if (type === 'weights') return 'bg-primary';
    return 'bg-secondary';
  }

  const workoutDays = days.filter((d) => d.type).length;

  return (
    <div className="bg-surface-container-low border border-outline p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" strokeWidth={1.5} />
          <span className="text-sm font-bold text-on-surface">Activity</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
          <span className="font-mono">{workoutDays} days</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-surface-container-high" />
            <div className="w-2 h-2 bg-primary/30" />
            <div className="w-2 h-2 bg-primary" />
            <div className="w-2 h-2 bg-secondary" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px] min-w-max">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-[3px]">
              {week.map((day, dIdx) => (
                <div
                  key={dIdx}
                  className={`w-[11px] h-[11px] ${day.date ? getCellColor(day.type) : 'bg-transparent'}`}
                  title={day.date ? `${day.date}${day.type ? ` — ${day.type}` : ''}` : ''}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Month labels */}
      <div className="relative mt-1" style={{ height: 14 }}>
        {monthLabels.map((m) => (
          <span
            key={m.weekIdx}
            className="absolute text-[9px] font-mono text-on-surface-variant"
            style={{ left: m.weekIdx * 14 }}
          >
            {m.label}
          </span>
        ))}
      </div>
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
  const [knownActivities, setKnownActivities] = useState<string[]>([]);
  const [activityInput, setActivityInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutLog | null>(null);

  const DEFAULT_ACTIVITIES = ['Run', 'Walk', 'Bike', 'Rock Climbing', 'Swimming', 'Hiking', 'Yoga', 'Stretching'];

  useEffect(() => {
    fetch('/api/fitness/splits').then((r) => r.json()).then((d) => { setSplits(d.splits); setCurrentSplitIndex(d.currentSplitIndex ?? 0); }).catch(() => {});
    fetch('/api/fitness/workouts?distinct=activities').then((r) => r.json()).then((acts: string[]) => setKnownActivities(acts)).catch(() => {});
    fetch('/api/fitness/workouts').then((r) => r.json()).then((real: WorkoutLog[]) => {
      if (DEMO_MODE) {
        setWorkouts([...real, ...generateDemoWorkouts()]);
      } else {
        setWorkouts(real);
      }
    }).catch(() => {});
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
      const rawActivity = activityInput.trim() || (data.get('activity') as string) || 'Run';
      const activity = rawActivity.replace(/\b\w/g, (c) => c.toUpperCase());
      const payload = {
        activity,
        date: data.get('date') || undefined,
        duration_minutes: (data.get('duration') || data.get('seconds')) ? (parseFloat(data.get('duration') as string || '0') + parseFloat(data.get('seconds') as string || '0') / 60) : null,
        distance_miles: data.get('distance') ? parseFloat(data.get('distance') as string) : null,
        reps: data.get('reps') ? parseInt(data.get('reps') as string, 10) : null,
        notes: data.get('notes') || null,
      };

      if (editingWorkout) {
        // Update existing
        const res = await fetch('/api/fitness/workouts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingWorkout.id, ...payload }) });
        if (res.ok) {
          const updated = await res.json();
          setWorkouts((prev) => prev.map((w) => w.id === updated.id ? updated : w));
          setCardioStatus('Updated!');
        }
      } else {
        // Create new
        const res = await fetch('/api/fitness/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          const saved = await res.json();
          setWorkouts((prev) => [saved, ...prev]);
          setCardioStatus('Saved!');
        }
      }
      form.reset();
      setActivityInput('');
      setEditingWorkout(null);
      setPageState('idle');
      fetch('/api/fitness/workouts?distinct=activities').then((r) => r.json()).then(setKnownActivities).catch(() => {});
      setTimeout(() => setCardioStatus(''), 2000);
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
                <input
                  data-exercise-name
                  type="text"
                  value={ex.name}
                  onChange={(e) => {
                    setExercises((prev) => prev.map((ex2, i) =>
                      i === exIdx ? { ...ex2, name: e.target.value } : ex2
                    ));
                  }}
                  className="text-sm font-bold text-on-surface bg-transparent focus:outline-none focus:border-b focus:border-primary"
                />
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

        <button
          onClick={() => {
            setExercises((prev) => [...prev, {
              name: 'New Exercise',
              sets: [{ reps: 10, weight: 0, confirmed: false }, { reps: 10, weight: 0, confirmed: false }, { reps: 10, weight: 0, confirmed: false }],
            }]);
            // Focus the name input after render
            setTimeout(() => {
              const inputs = document.querySelectorAll<HTMLInputElement>('[data-exercise-name]');
              const last = inputs[inputs.length - 1];
              if (last) { last.focus(); last.select(); }
            }, 50);
          }}
          className="w-full py-3 text-xs font-bold border border-dashed border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add Exercise
        </button>

        <p className="text-[10px] text-on-surface-variant text-center mt-4">
          Tap to confirm · Hold + drag to adjust · Double-tap for precise edit
        </p>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // LOG ACTIVITY FORM
  // ══════════════════════════════════════════════════════════════════
  if (pageState === 'cardio') {
    // Merge known activities with defaults, case-insensitive deduplicate
    const seen = new Map<string, string>();
    for (const a of [...DEFAULT_ACTIVITIES, ...knownActivities]) {
      if (!seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
    }
    const allSuggestions = [...seen.values()];
    const filtered = activityInput.length > 0
      ? allSuggestions.filter((a) => a.toLowerCase().includes(activityInput.toLowerCase()))
      : allSuggestions;

    return (
      <>
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setPageState('idle'); setActivityInput(''); setShowSuggestions(false); setEditingWorkout(null); }} className="text-on-surface-variant hover:text-white">
              <RotateCcw size={20} />
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">{editingWorkout ? 'Edit Activity' : 'Log Activity'}</h1>
          </div>
        </div>
        <form onSubmit={saveCardio} className="bg-surface-container-low border border-outline p-5 mb-6">
          {/* Activity with autocomplete */}
          <div className="mb-4 relative">
            <label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Activity</label>
            <input
              type="text"
              name="activity"
              value={activityInput}
              onChange={(e) => { setActivityInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="e.g. Rock Climbing, Run, Yoga"
              autoComplete="off"
              className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none"
            />
            {showSuggestions && filtered.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-container border border-outline max-h-48 overflow-y-auto">
                {filtered.slice(0, 8).map((activity) => (
                  <button
                    key={activity}
                    type="button"
                    onClick={() => { setActivityInput(activity); setShowSuggestions(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
                  >
                    {activity}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Minutes</label><input type="number" name="duration" inputMode="numeric" placeholder="25" defaultValue={editingWorkout?.duration_minutes ? Math.floor(editingWorkout.duration_minutes) : undefined} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Seconds</label><input type="number" name="seconds" inputMode="numeric" min="0" max="59" placeholder="30" defaultValue={editingWorkout?.duration_minutes ? Math.round((editingWorkout.duration_minutes % 1) * 60) : undefined} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Miles</label><input type="number" name="distance" inputMode="decimal" step="any" placeholder="opt." defaultValue={editingWorkout?.distance_miles ?? undefined} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Reps</label><input type="number" name="reps" inputMode="numeric" placeholder="opt." defaultValue={editingWorkout?.reps ?? undefined} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Notes</label><input type="text" name="notes" placeholder="How'd it go?" defaultValue={editingWorkout?.notes ?? undefined} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base text-on-surface focus:border-primary focus:outline-none" /></div>
            <div><label className="block text-[11px] text-on-surface-variant section-header mb-1.5">Date</label><input type="date" name="date" defaultValue={editingWorkout?.date ?? new Date().toLocaleDateString('en-CA')} className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-base font-mono text-on-surface focus:border-primary focus:outline-none" /></div>
          </div>
          <button type="submit" disabled={!activityInput.trim()} className="w-full bg-primary text-on-primary px-6 py-4 text-base font-bold disabled:opacity-40">{editingWorkout ? 'Update' : 'Save'}</button>
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

      <Heatmap workouts={workouts} />
      <ScoreTimeline workouts={workouts} />

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
              Log Activity
            </button>
          </div>
        </div>
      )}

      {workouts.length > 0 && (
        <div>
          <h3 className="text-xs text-on-surface-variant section-header mb-3">Recent</h3>
          <div className="space-y-1">
            {workouts.map((w) => (
              <div key={w.id} className="bg-surface-container-low border border-outline px-4 py-3 flex items-center justify-between group">
                <div>
                  <span className="text-sm font-bold text-on-surface capitalize">{w.split_name ? `${w.split_name} Day` : w.activity}</span>
                  <span className="text-[10px] text-on-surface-variant font-mono ml-2">{w.date}</span>
                  {w.notes && <p className="text-xs text-on-surface-variant/70 mt-0.5 italic">{w.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs font-mono text-on-surface-variant">
                    {w.type === 'weights' ? <span className="text-primary">weights</span> : <>{w.reps && <span>{w.reps} reps</span>}{w.duration_minutes && <span className={w.reps ? 'ml-2' : ''}>{Math.round(w.duration_minutes)} min</span>}{w.distance_miles && <span className="ml-2">{w.distance_miles} mi</span>}</>}
                  </div>
                  {w.type !== 'weights' && (
                    <button
                      onClick={() => {
                        setEditingWorkout(w);
                        setActivityInput(w.activity);
                        setPageState('cardio');
                      }}
                      className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-all duration-75"
                    >
                      <Pencil size={14} />
                    </button>
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
