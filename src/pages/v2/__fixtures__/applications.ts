import type { MyApplication } from '@/types';
import { TRIP_FIXTURES } from './trips';

export const APPLICATION_FIXTURES: MyApplication[] = [
  {
    acceptanceId: 'a1',
    status: 'applied',
    appliedAt: '2026-05-17T08:00:00Z',
    trip: TRIP_FIXTURES[0],
  },
  {
    acceptanceId: 'a2',
    status: 'selected',
    appliedAt: '2026-05-17T07:30:00Z',
    trip: TRIP_FIXTURES[1],
  },
  {
    acceptanceId: 'a3',
    status: 'accepted',
    appliedAt: '2026-05-16T18:00:00Z',
    trip: TRIP_FIXTURES[2],
  },
];
