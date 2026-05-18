import { SUS_QUESTIONS } from './questions';

/**
 * Compute a System Usability Scale (SUS) score from a reviewer's 10 Likert
 * responses (each 1–5; 1 = Strongly disagree, 5 = Strongly agree).
 *
 * Brooke's 1986 formula:
 *  - Odd-indexed items (1,3,5,7,9) — positive polarity: contribution = score − 1
 *  - Even-indexed items (2,4,6,8,10) — negative polarity: contribution = 5 − score
 *  - Sum (range 0–40) × 2.5 → final score on 0–100 scale.
 *
 * >68 is "above average" per Sauro/Bangor industry benchmarking.
 *
 * Throws if `responses.length !== 10` or any item is outside 1..5 — the
 * questionnaire UI guarantees both before calling, so a throw here indicates
 * a programming bug rather than user input.
 */
export function computeSusScore(responses: readonly number[]): number {
  if (responses.length !== SUS_QUESTIONS.length) {
    throw new Error(`SUS expects ${SUS_QUESTIONS.length} responses, got ${responses.length}`);
  }
  let sum = 0;
  for (let i = 0; i < SUS_QUESTIONS.length; i++) {
    const raw = responses[i];
    if (!Number.isInteger(raw) || raw < 1 || raw > 5) {
      throw new Error(`SUS response at index ${i} must be an integer 1..5; got ${raw}`);
    }
    const polarity = SUS_QUESTIONS[i].polarity;
    sum += polarity === 'positive' ? raw - 1 : 5 - raw;
  }
  return sum * 2.5;
}

/** Average of a per-reviewer SUS-score list (returns null if empty). */
export function averageSusScore(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
