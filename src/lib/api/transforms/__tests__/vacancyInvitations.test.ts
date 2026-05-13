import { describe, it, expect } from 'vitest';
import {
  toApiCreateVacancyInvitation,
  transformVacancyInvitation,
  VacancyInvitationTransformError,
} from '@/lib/api/transforms/vacancyInvitations';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sort_order: 10, is_active: true });

const baseRow = {
  id: 'inv1',
  vacancy_id: 'vac1',
  trip_id: 'tr1',
  invited_by_user_id: 'agent-u1',
  driver_id: 'd1',
  status: 'pending',
  message: 'Come drive this one',
  expires_at: '2026-05-15T10:00:00Z',
  created_at: '2026-05-13T10:00:00Z',
  inviter_handle: 'A1B2C3D',
  inviter_name: 'Agent A',
};

describe('transformVacancyInvitation', () => {
  it('maps a pending invitation with a redacted driver row + joined trip/vacancy', () => {
    const v = transformVacancyInvitation({
      ...baseRow,
      driver: { id: 'd1', user_id: 'driver-u1', display_handle: 'AFFE001', rating_avg: 4.8, rating_count: 12, total_trips_completed: 30, top_tags: ['Punctual'] },
      trip: { id: 'tr1', status: 'open', pickup_at: '2026-06-01T08:00:00Z', expected_distance_km: 120, total_fare: 1680, driver_payout: 1690, from_city: city('c1', 'Vellore'), to_city: city('c2', 'Chennai') },
      vacancy: { id: 'vac1', status: 'active', current_city: city('c1', 'Vellore') },
    });
    expect(v.id).toBe('inv1');
    expect(v.status).toBe('pending');
    expect(v.inviterHandle).toBe('A1B2C3D');
    expect(v.inviterName).toBe('Agent A');
    expect(v.driver?.displayHandle).toBe('AFFE001');
    // pre-reveal: identity fields absent (the server stripped them)
    expect(v.driver?.fullName).toBeUndefined();
    expect(v.driver?.profilePhotoUrl).toBeUndefined();
    expect(v.trip?.totalFare).toBe(1680);
    expect(v.trip?.fromCity?.name).toBe('Vellore');
    expect(v.vacancy?.status).toBe('active');
  });

  it('keeps driver identity when the server returned it (post-accept reveal)', () => {
    const v = transformVacancyInvitation({
      ...baseRow,
      status: 'accepted',
      decided_at: '2026-05-14T11:00:00Z',
      driver: { id: 'd1', user_id: 'driver-u1', display_handle: 'AFFE001', full_name: 'Ravi Kumar', phone: '+919999999999', profile_photo_url: 'https://x/p.jpg', rating_avg: 4.8, rating_count: 12, total_trips_completed: 30, top_tags: [] },
    });
    expect(v.status).toBe('accepted');
    expect(v.decidedAt).toBe('2026-05-14T11:00:00Z');
    expect(v.driver?.fullName).toBe('Ravi Kumar');
    expect(v.driver?.profilePhotoUrl).toBe('https://x/p.jpg');
  });

  it('throws on missing id / vacancy_id / trip_id', () => {
    expect(() => transformVacancyInvitation({ ...baseRow, id: undefined })).toThrow(VacancyInvitationTransformError);
    expect(() => transformVacancyInvitation({ ...baseRow, vacancy_id: undefined })).toThrow(/MISSING_VACANCY_ID/);
    expect(() => transformVacancyInvitation({ ...baseRow, trip_id: undefined })).toThrow(/MISSING_TRIP_ID/);
  });

  it('coerces an unknown status to "pending"', () => {
    const v = transformVacancyInvitation({ ...baseRow, status: 'whatever' });
    expect(v.status).toBe('pending');
  });

  it('leaves optional joins undefined when omitted', () => {
    const v = transformVacancyInvitation(baseRow);
    expect(v.driver).toBeUndefined();
    expect(v.trip).toBeUndefined();
    expect(v.vacancy).toBeUndefined();
  });
});

describe('toApiCreateVacancyInvitation', () => {
  it('maps camelCase → snake_case', () => {
    expect(toApiCreateVacancyInvitation({ vacancyId: 'v1', tripId: 't1', message: 'hello' })).toEqual({
      vacancy_id: 'v1',
      trip_id: 't1',
      message: 'hello',
    });
  });
  it('omits message when undefined', () => {
    expect(toApiCreateVacancyInvitation({ vacancyId: 'v1', tripId: 't1' })).toEqual({ vacancy_id: 'v1', trip_id: 't1' });
  });
});
