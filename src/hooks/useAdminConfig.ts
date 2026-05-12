/**
 * React Query hooks for the admin master-data resources.
 *
 * A typed `makeAdminHooks` factory drives the uniform lookup tables; the
 * irregular ones (`seat_options`, filtered model/tag lists, `app_settings`)
 * get explicit hooks below. Every mutation invalidates `['admin', '<list>']`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  cancelReasonsApi,
  carTypesApi,
  citiesApi,
  fuelTypesApi,
  getAppSettings,
  getReviewTagsByCategory,
  getVehicleModelsForMake,
  languagesApi,
  reviewTagsApi,
  seatOptionsApi,
  updateAppSettings,
  vehicleMakesApi,
  vehicleModelsApi,
  type ResourceApi,
} from '@/lib/api/services/admin-config';
import type { AppSettingsInput, ReviewTagCategory } from '@/types';

type ListOpts = { includeInactive?: boolean };

function makeAdminHooks<TRow, TInput>(list: string, api: ResourceApi<TRow, TInput>) {
  const baseKey = ['admin', list] as const;

  function useInvalidate() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: baseKey });
  }

  return {
    useList(opts?: ListOpts) {
      return useQuery({ queryKey: [...baseKey, opts ?? {}], queryFn: () => api.list(opts), staleTime: STALE.master });
    },
    useCreate() {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: (input: TInput) => api.create(input), onSuccess: invalidate });
    },
    useUpdate() {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<TInput> }) => api.update(id, patch), onSuccess: invalidate });
    },
    useToggleActive() {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.setActive(id, isActive), onSuccess: invalidate });
    },
    useRemove() {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: (id: string) => api.remove(id), onSuccess: invalidate });
    },
    useReorder() {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: (ids: string[]) => api.reorder(ids), onSuccess: invalidate });
    },
  };
}

export const carTypeHooks = makeAdminHooks('car-types', carTypesApi);
export const fuelTypeHooks = makeAdminHooks('fuel-types', fuelTypesApi);
export const vehicleMakeHooks = makeAdminHooks('vehicle-makes', vehicleMakesApi);
export const vehicleModelHooks = makeAdminHooks('vehicle-models', vehicleModelsApi);
export const cityHooks = makeAdminHooks('cities', citiesApi);
export const languageHooks = makeAdminHooks('languages', languagesApi);
export const reviewTagHooks = makeAdminHooks('review-tags', reviewTagsApi);
export const cancelReasonHooks = makeAdminHooks('cancel-reasons', cancelReasonsApi);

// ── seat_options (keyed by `value`) ─────────────────────────────────────────
export function useSeatOptions(opts?: ListOpts) {
  return useQuery({ queryKey: ['admin', 'seat-options', opts ?? {}], queryFn: () => seatOptionsApi.list(opts), staleTime: STALE.master });
}
function useInvalidateSeatOptions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin', 'seat-options'] });
}
export function useCreateSeatOption() {
  const invalidate = useInvalidateSeatOptions();
  return useMutation({ mutationFn: (value: number) => seatOptionsApi.create(value), onSuccess: invalidate });
}
export function useToggleSeatOption() {
  const invalidate = useInvalidateSeatOptions();
  return useMutation({ mutationFn: ({ value, isActive }: { value: number; isActive: boolean }) => seatOptionsApi.setActive(value, isActive), onSuccess: invalidate });
}
export function useRemoveSeatOption() {
  const invalidate = useInvalidateSeatOptions();
  return useMutation({ mutationFn: (value: number) => seatOptionsApi.remove(value), onSuccess: invalidate });
}

// ── filtered views ──────────────────────────────────────────────────────────
export function useVehicleModelsForMake(makeId: string | undefined, opts?: ListOpts) {
  return useQuery({
    queryKey: ['admin', 'vehicle-models', 'by-make', makeId, opts ?? {}],
    queryFn: () => getVehicleModelsForMake(makeId as string, opts),
    enabled: !!makeId,
    staleTime: STALE.master,
  });
}
export function useReviewTagsByCategory(category: ReviewTagCategory, opts?: ListOpts) {
  return useQuery({
    queryKey: ['admin', 'review-tags', 'by-category', category, opts ?? {}],
    queryFn: () => getReviewTagsByCategory(category, opts),
    staleTime: STALE.master,
  });
}

// ── app_settings ────────────────────────────────────────────────────────────
export function useAppSettings() {
  return useQuery({ queryKey: ['admin', 'app-settings'], queryFn: getAppSettings, staleTime: STALE.master });
}
export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: AppSettingsInput) => updateAppSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] }),
  });
}
