'use client';

import { useState, useEffect } from 'react';
import BackButton from '@/components/layout/BackButton';
import { BookOpen } from 'lucide-react';

interface ReadingLog {
  id: number;
  date: string;
  pages: number;
}

export default function ReadingPage() {
  const [pages, setPages] = useState('');
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/reading/log')
      .then((r) => r.json())
      .then(setLogs)
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    const n = parseInt(pages, 10);
    if (!n || n <= 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/reading/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: n }),
      });
      if (res.ok) {
        const saved = await res.json();
        setLogs((prev) => [saved, ...prev]);
        setPages('');
        setStatus(`Logged ${n} pages`);
        setTimeout(() => setStatus(''), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const todayTotal = logs
    .filter((l) => l.date === new Date().toISOString().split('T')[0])
    .reduce((sum, l) => sum + l.pages, 0);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BackButton />
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
            Reading
          </h1>
        </div>
      </div>

      <div className="max-w-md">
        <div className="bg-surface-container-low border border-outline p-6">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen size={20} className="text-primary" />
            <span className="text-xs text-on-surface-variant section-header">Log Pages</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Pages read"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="flex-1 bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={saving || !pages || parseInt(pages, 10) <= 0}
              className="px-4 py-2 bg-primary text-on-primary text-xs font-bold hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Saving...' : 'Submit'}
            </button>
          </div>

          {status && (
            <p className="text-xs text-secondary font-mono mt-3">{status}</p>
          )}

          {todayTotal > 0 && (
            <div className="mt-4 pt-4 border-t border-outline">
              <span className="text-[10px] text-on-surface-variant section-header">Today</span>
              <p className="font-mono text-lg text-primary">{todayTotal} pages</p>
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div className="mt-4 space-y-1">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between bg-surface-container-low border border-outline px-4 py-2">
                <span className="text-xs text-on-surface-variant font-mono">{l.date}</span>
                <span className="text-sm font-mono text-on-surface">{l.pages} pg</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
