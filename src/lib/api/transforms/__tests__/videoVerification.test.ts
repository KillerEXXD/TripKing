import { describe, it, expect } from 'vitest';
import {
  VideoVerificationTransformError,
  toApiFinalizeVideoCall,
  transformVideoCallSlot,
  transformVideoVerification,
} from '@/lib/api/transforms/videoVerification';

describe('transformVideoVerification', () => {
  it('maps a scheduled driver call with the joined subject', () => {
    const vv = transformVideoVerification({
      id: 'vv1',
      driver_id: 'd1',
      manager_id: null,
      status: 'scheduled',
      scheduled_at: '2026-05-13T04:30:00.000Z',
      slot_minutes: 15,
      meeting_provider: 'jitsi',
      meeting_url: 'https://meet.jit.si/tripking-vv1',
      face_match_confirmed: false,
      documents_confirmed: false,
      liveness_check_passed: false,
      outcome: null,
      driver: { id: 'd1', full_name: 'Ravi', phone: '+919', kyc_status: 'video_pending', home_city: { name: 'Vellore' } },
    });
    expect(vv).toMatchObject({
      id: 'vv1',
      driverId: 'd1',
      managerId: undefined,
      status: 'scheduled',
      slotMinutes: 15,
      meetingUrl: 'https://meet.jit.si/tripking-vv1',
      faceMatchConfirmed: false,
      driver: { id: 'd1', fullName: 'Ravi', kycStatus: 'video_pending', cityName: 'Vellore' },
    });
  });

  it('maps a completed approved call', () => {
    const vv = transformVideoVerification({
      id: 'vv2', manager_id: 'm1', status: 'completed', scheduled_at: '2026-05-13T05:00:00.000Z',
      face_match_confirmed: true, documents_confirmed: true, liveness_check_passed: true, outcome: 'approved', notes: 'ok',
    });
    expect(vv.status).toBe('completed');
    expect(vv.outcome).toBe('approved');
    expect(vv.managerId).toBe('m1');
    expect(vv.notes).toBe('ok');
  });

  it('coerces an unknown status/outcome to defaults', () => {
    const vv = transformVideoVerification({ id: 'vv3', driver_id: 'd1', status: 'weird', scheduled_at: '2026-05-13T05:00:00Z', outcome: 'maybe' });
    expect(vv.status).toBe('scheduled');
    expect(vv.outcome).toBeUndefined();
  });

  it('throws on missing id', () => {
    expect(() => transformVideoVerification({ scheduled_at: '2026-05-13T05:00:00Z' })).toThrow(VideoVerificationTransformError);
  });
  it('throws on missing scheduled_at', () => {
    expect(() => transformVideoVerification({ id: 'vv4', driver_id: 'd1' })).toThrow(/MISSING_SCHEDULED_AT/);
  });
});

describe('transformVideoCallSlot', () => {
  it('maps a slot', () => {
    expect(transformVideoCallSlot({ slot_at: '2026-05-13T04:30:00.000Z', slot_minutes: 15 })).toEqual({ slotAt: '2026-05-13T04:30:00.000Z', slotMinutes: 15 });
  });
  it('defaults slot_minutes to 15', () => {
    expect(transformVideoCallSlot({ slot_at: '2026-05-13T04:30:00.000Z' }).slotMinutes).toBe(15);
  });
});

describe('toApiFinalizeVideoCall', () => {
  it('snake-cases the gates + outcome and drops empty notes', () => {
    expect(toApiFinalizeVideoCall({ outcome: 'approved', faceMatchConfirmed: true, documentsConfirmed: true, livenessCheckPassed: true })).toEqual({
      outcome: 'approved', face_match_confirmed: true, documents_confirmed: true, liveness_check_passed: true,
    });
  });
  it('includes notes when present', () => {
    expect(toApiFinalizeVideoCall({ outcome: 'rejected', faceMatchConfirmed: false, documentsConfirmed: true, livenessCheckPassed: true, notes: 'blurry' }).notes).toBe('blurry');
  });
});
