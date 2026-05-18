import { apiClient } from '@/lib/api/client';
import type { SkinVersion } from '@/lib/designFeedback/questions';

/** Wire-shape — exactly what the admin edge function accepts/returns. */
export interface DesignFeedbackSubmitInput {
  reviewer_name: string;
  preferences: Record<string, string>;           // questionKey → "vN" picked
  sus_scores: Partial<Record<SkinVersion, number[]>>;  // per-version 10 Likert responses (1..5)
  cross_page: Record<string, string>;            // questionKey → "vN" (or text)
  notes?: string;
}

export interface DesignFeedbackRow {
  id: string;
  reviewer_user_id: string | null;
  reviewer_name: string;
  submitted_at: string;
  preferences: Record<string, string>;
  sus_scores: Partial<Record<SkinVersion, number[]>>;
  cross_page: Record<string, string>;
  notes: string | null;
}

export async function submitDesignFeedback(input: DesignFeedbackSubmitInput): Promise<{ id: string; submitted_at: string }> {
  const r = await apiClient.post<{ id: string; submitted_at: string }>('/admin/design-feedback', input);
  if (!r.data) throw new Error('Empty response from /admin/design-feedback');
  return r.data;
}

export async function listDesignFeedback(): Promise<DesignFeedbackRow[]> {
  const r = await apiClient.get<DesignFeedbackRow[]>('/admin/design-feedback');
  return r.data ?? [];
}
