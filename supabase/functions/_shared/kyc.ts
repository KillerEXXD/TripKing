/**
 * Shared KYC checklist helpers used across drivers / agents / video-verifications.
 *
 * The auto-promotion rule: when every checklist step is "done" and the row is mid-flow
 * (docs_submitted / video_pending), bump it to ready_for_approval so the admin sees a
 * single "Ready for your approval" item in the queue.
 */
// @ts-expect-error — resolved by Deno at runtime; this file is not compiled by the app's tsc.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Row = Record<string, unknown>;
type Db = SupabaseClient;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const REQUIRED_VEHICLE_PHOTO_COLS = [
  'photo_front_url', 'photo_back_url', 'photo_left_url', 'photo_right_url', 'photo_plate_url', 'rc_book_url', 'insurance_url',
] as const;

/** Returns true if every non-video checklist step for a driver is done. */
async function driverNonVideoStepsDone(db: Db, driverId: string): Promise<boolean> {
  const { data: d } = await db.from('drivers')
    .select('full_name, home_city_id, aadhaar_front_path, aadhaar_back_path, driver_license_path, selfie_path')
    .eq('id', driverId).maybeSingle();
  if (!d) return false;
  const drv = d as Row;
  const detailsDone = !!str(drv.full_name) && !!drv.home_city_id;
  const docsDone = !!drv.aadhaar_front_path && !!drv.aadhaar_back_path && !!drv.driver_license_path && !!drv.selfie_path;
  if (!detailsDone || !docsDone) return false;
  const { data: vehs } = await db.from('vehicles').select('*').eq('driver_id', driverId).eq('is_active', true);
  const vehicles = (vehs ?? []) as Row[];
  if (vehicles.length === 0) return false;
  const chosen = vehicles.find((v) => v.is_primary) ?? vehicles[0];
  return REQUIRED_VEHICLE_PHOTO_COLS.every((c) => typeof chosen[c] === 'string' && (chosen[c] as string).length > 0);
}

/** Returns true if every non-video checklist step for an agent is done. */
async function agentNonVideoStepsDone(db: Db, agentId: string): Promise<boolean> {
  const { data: a } = await db.from('trip_managers')
    .select('full_name, business_city_id, home_city_id, aadhaar_front_path, aadhaar_back_path, selfie_path')
    .eq('id', agentId).maybeSingle();
  if (!a) return false;
  const ag = a as Row;
  const cityDone = !!ag.business_city_id || !!ag.home_city_id;
  const detailsDone = !!str(ag.full_name) && cityDone;
  const docsDone = !!ag.aadhaar_front_path && !!ag.aadhaar_back_path && !!ag.selfie_path;
  return detailsDone && docsDone;
}

/** Returns true if the most recent video verification has finalized approved. */
async function videoStepDone(db: Db, kind: 'driver' | 'manager', subjectId: string): Promise<boolean> {
  const col = kind === 'driver' ? 'driver_id' : 'manager_id';
  const { data } = await db.from('video_verifications')
    .select('status, outcome')
    .eq(col, subjectId).order('created_at', { ascending: false }).limit(1);
  const vv = (data && data[0]) as Row | undefined;
  return !!vv && vv.status === 'completed' && vv.outcome === 'approved';
}

/**
 * Re-evaluates the subject's checklist after a mutation (docs upload, vehicle change,
 * video finalize) and bumps `kyc_status` to `ready_for_approval` when every step is
 * green and the row is sitting in docs_submitted or video_pending. No-op otherwise.
 */
export async function maybePromoteToReadyForApproval(
  db: Db,
  kind: 'driver' | 'manager',
  subjectId: string,
): Promise<void> {
  const table = kind === 'driver' ? 'drivers' : 'trip_managers';
  const { data } = await db.from(table).select('kyc_status').eq('id', subjectId).maybeSingle();
  const cur = str((data as Row | null)?.kyc_status);
  if (cur !== 'docs_submitted' && cur !== 'video_pending') return;
  const nonVideo = kind === 'driver'
    ? await driverNonVideoStepsDone(db, subjectId)
    : await agentNonVideoStepsDone(db, subjectId);
  if (!nonVideo) return;
  const video = await videoStepDone(db, kind, subjectId);
  if (!video) return;
  await db.from(table).update({ kyc_status: 'ready_for_approval' }).eq('id', subjectId);
}
