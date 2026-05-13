import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getPassengers, lookupPassengerByPhone } from '@/lib/api/services/passengers';
import type { PassengersQueryParams } from '@/types';

/** A phone "complete enough" to look up — at least 10 digits (an Indian mobile, with or without +91). */
export function isLookupablePhone(phone: string | undefined): boolean {
  return (phone ?? '').replace(/\D/g, '').length >= 10;
}

/** `GET /passengers` — the admin passengers directory. */
export function usePassengers(params?: PassengersQueryParams) {
  return useQuery({ queryKey: ['passengers', params ?? {}], queryFn: () => getPassengers(params), staleTime: STALE.profile });
}

/**
 * `GET /passengers/lookup?phone=` — used by the post-trip form to prefill the
 * name. Only fires once the phone is {@link isLookupablePhone}-complete; keyed on
 * the digits so re-typing the same number doesn't refetch; `null` data ⇒ no match.
 */
export function useLookupPassengerByPhone(phone: string | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  return useQuery({
    queryKey: ['passengers', 'lookup', digits],
    queryFn: () => lookupPassengerByPhone((phone ?? '').trim()),
    enabled: isLookupablePhone(phone),
    retry: false,
    staleTime: STALE.profile,
  });
}
