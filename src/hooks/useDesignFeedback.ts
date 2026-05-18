import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { listDesignFeedback, submitDesignFeedback, type DesignFeedbackSubmitInput } from '@/lib/api/services/designFeedback';

/** Admin-only: read all submissions (powers the results dashboard). */
export function useDesignFeedbackResults() {
  return useQuery({
    queryKey: ['admin', 'design-feedback'],
    queryFn: listDesignFeedback,
    staleTime: STALE.live,
  });
}

/** Submit the reviewer's completed questionnaire. */
export function useSubmitDesignFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesignFeedbackSubmitInput) => submitDesignFeedback(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'design-feedback'] });
    },
  });
}
