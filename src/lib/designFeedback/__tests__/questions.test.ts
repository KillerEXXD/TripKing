import { describe, it, expect } from 'vitest';
import {
  PREFERENCE_PAGES,
  SUS_QUESTIONS,
  CROSS_PAGE_QUESTIONS,
  SKIN_VERSIONS,
  VERSION_LABELS,
} from '@/lib/designFeedback/questions';

describe('design feedback question set', () => {
  it('has 9 preference pages with unique pageKeys', () => {
    expect(PREFERENCE_PAGES.length).toBe(9);
    const keys = PREFERENCE_PAGES.map((p) => p.pageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every preference question key is unique across all pages and contains its pageKey prefix', () => {
    const allKeys: string[] = [];
    for (const page of PREFERENCE_PAGES) {
      for (const q of page.questions) {
        allKeys.push(q.key);
        expect(q.key.startsWith(`${page.pageKey}.`), `key ${q.key} should be prefixed with ${page.pageKey}.`).toBe(true);
      }
    }
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it('every page has exactly one forced-ship question', () => {
    for (const page of PREFERENCE_PAGES) {
      const shipQs = page.questions.filter((q) => q.forcedShip);
      expect(shipQs.length, `page ${page.pageKey} should have exactly 1 forced-ship`).toBe(1);
      expect(shipQs[0].key.endsWith('.ship')).toBe(true);
    }
  });

  it('SUS has exactly 10 items alternating positive/negative starting positive', () => {
    expect(SUS_QUESTIONS.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(SUS_QUESTIONS[i].index).toBe(i + 1);
      const expected = i % 2 === 0 ? 'positive' : 'negative';
      expect(SUS_QUESTIONS[i].polarity).toBe(expected);
    }
  });

  it('cross-page questions have unique keys + a forced_ship pick-version + a text notes', () => {
    const keys = CROSS_PAGE_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    const forced = CROSS_PAGE_QUESTIONS.find((q) => q.key === 'forced_ship');
    expect(forced?.kind).toBe('pick-version');
    const notes = CROSS_PAGE_QUESTIONS.find((q) => q.key === 'notes');
    expect(notes?.kind).toBe('text');
  });

  it('VERSION_LABELS covers every skin version exactly', () => {
    for (const v of SKIN_VERSIONS) expect(VERSION_LABELS[v]).toBeTruthy();
    expect(Object.keys(VERSION_LABELS).sort()).toEqual([...SKIN_VERSIONS].sort());
  });
});
