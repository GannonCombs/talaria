'use client';

import { useState } from 'react';
import BackButton from '@/components/layout/BackButton';
import { BookOpen } from 'lucide-react';

export default function ReadingPage() {
  const [pages, setPages] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!pages || parseInt(pages, 10) <= 0) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
    setPages('');
  }

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
              placeholder="Pages read"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="flex-1 bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={!pages || parseInt(pages, 10) <= 0}
              className="px-4 py-2 bg-primary text-on-primary text-xs font-bold hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              Submit
            </button>
          </div>

          {submitted && (
            <p className="text-xs text-secondary font-mono mt-3">
              Logged {pages || '—'} pages.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
