import { useCallback, useEffect, useState } from 'react';
import type { SkinVersion } from './questions';

/**
 * Reviewer's in-progress questionnaire — persisted to localStorage so they can
 * close the tab and resume later. The draft is wiped when a submission is
 * successfully POSTed; until then it stays put. Multiple devices = separate
 * drafts (the data is small enough that we don't sync).
 */
export interface FeedbackDraft {
  reviewerName: string;
  preferences: Record<string, string>;        // questionKey → "v2".."v7"
  preferencesWhy: Record<string, string>;     // questionKey → free text (optional)
  sus: Partial<Record<SkinVersion, number[]>>; // version → 10 Likert numbers (1..5)
  crossPage: Record<string, string>;
  notes: string;
}

const KEY = 'tripking.designFeedback.draft.v1';

function emptyDraft(): FeedbackDraft {
  return { reviewerName: '', preferences: {}, preferencesWhy: {}, sus: {}, crossPage: {}, notes: '' };
}

function read(): FeedbackDraft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<FeedbackDraft>;
    return { ...emptyDraft(), ...parsed };
  } catch {
    return emptyDraft();
  }
}

function write(d: FeedbackDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // quota or private-window — silently drop; reviewer can still complete in this session.
  }
}

export function clearFeedbackDraft() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/**
 * Read+mutate the questionnaire draft. The hook persists every change.
 * `set` accepts either a new value or an updater fn for fine-grained edits.
 */
export function useFeedbackDraft() {
  const [draft, setDraft] = useState<FeedbackDraft>(emptyDraft);

  // Hydrate from localStorage on mount.
  useEffect(() => { setDraft(read()); }, []);

  const update = useCallback(<K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K] | ((prev: FeedbackDraft[K]) => FeedbackDraft[K])) => {
    setDraft((prev) => {
      const next = typeof value === 'function'
        ? { ...prev, [key]: (value as (p: FeedbackDraft[K]) => FeedbackDraft[K])(prev[key]) }
        : { ...prev, [key]: value };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearFeedbackDraft();
    setDraft(emptyDraft());
  }, []);

  return { draft, update, reset };
}
