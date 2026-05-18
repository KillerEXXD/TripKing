import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Real-API setup helpers for Playwright E2E. Every spec uses these to mint its preconditions
 * (driver/agent/admin accounts, KYC approval, trips, applications, wallet seeds, etc.) against
 * the deployed Supabase edge functions — NOT via network stubs.
 *
 * Why: stubbed preconditions don't catch backend drift (broken migration, RLS regression,
 * transform throw, edge-fn 500). See `docs/TEST_POLICY.md` §"E2E preconditions are real".
 *
 * Pattern: per-test ephemeral data. Every mintXxx() generates a timestamp-unique phone +
 * names everything `e2e-…` so the nightly purge cron (migration 054) can sweep stale rows
 * older than 7 days. Parallel-safe by construction — no two tests collide.
 *
 * Permitted stub-error carve-out: forcing a specific HTTP error response is still allowed
 * (use Playwright's `page.route` directly in the spec, tagged with a `@stub-error` block
 * comment). See `referral-qase-demo.spec.ts` R6.3 for the canonical example.
 */

// Default = the deployed dev Supabase. CI workflows can override.
export const API_BASE = (
  process.env.PLAYWRIGHT_API_BASE ?? 'https://saxcbebqxgatiktsebxw.supabase.co/functions/v1'
).replace(/\/+$/, '');

// LocalStorage keys the frontend's apiClient reads. Must match src/lib/api/client.ts.
const ACCESS_TOKEN_KEY = 'tk_access_token';
const REFRESH_TOKEN_KEY = 'tk_refresh_token';

// ── primitives ──────────────────────────────────────────────────────────────

/** Unique phone every call: +91 990 + ms-timestamp tail (6) + random (3). Parallel-safe. */
export function uniquePhone(): string {
  const tail = Date.now().toString().slice(-6);
  const rnd = Math.floor(100 + Math.random() * 900);
  return `+91990${tail}${rnd}`;
}

/** Unique display name. */
export function uniqueName(role: string): string {
  return `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function call<T = unknown>(
  req: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { token?: string; data?: unknown } = {},
): Promise<{ status: number; data: T | null; error?: { code?: string; message?: string } | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await req.fetch(`${API_BASE}${path}`, {
    method,
    headers,
    data: opts.data === undefined ? undefined : JSON.stringify(opts.data),
  });
  const text = await res.text();
  let body: { success?: boolean; data?: T; error?: { code?: string; message?: string } };
  try { body = JSON.parse(text); } catch { body = { data: undefined }; }
  return { status: res.status(), data: body?.data ?? null, error: body?.error ?? null };
}

// ── auth ────────────────────────────────────────────────────────────────────

export interface MintedUser {
  userId: string;
  phone: string;
  displayName: string;
  role: 'driver' | 'trip_manager' | 'admin';
  token: string;
  refreshToken: string;
}

/** Mint a fresh authed user. The dev `/auth/verify-otp` accepts OTP `12345` for any phone
 *  + creates the user on the fly with the requested role. */
export async function mintUser(
  req: APIRequestContext,
  role: 'driver' | 'trip_manager' | 'admin',
  opts: { displayName?: string; phone?: string } = {},
): Promise<MintedUser> {
  const phone = opts.phone ?? uniquePhone();
  const displayName = opts.displayName ?? uniqueName(role);
  await call(req, 'POST', '/auth/auth/request-otp', { data: { phone } });
  const verify = await call<{ user: { id: string }; access_token: string; refresh_token: string }>(
    req, 'POST', '/auth/auth/verify-otp',
    { data: { phone, otp: '12345', display_name: displayName, role } },
  );
  if (verify.status !== 200 || !verify.data?.access_token) {
    throw new Error(`mintUser(${role}) failed: ${verify.status} ${JSON.stringify(verify.error)}`);
  }
  return {
    userId: verify.data.user.id,
    phone,
    displayName,
    role,
    token: verify.data.access_token,
    refreshToken: verify.data.refresh_token,
  };
}

// ── drivers ─────────────────────────────────────────────────────────────────

export interface MintedDriver extends MintedUser {
  driverId: string;
}

/** Mint a driver: user + driver profile + (optional) KYC approval + wallet seed.
 *  Without an admin token the KYC approval step is skipped — caller can do it later. */
export async function mintDriver(
  req: APIRequestContext,
  opts: {
    adminToken?: string;
    kyc?: 'pending' | 'approved' | 'rejected';
    cashPaise?: number;
    displayName?: string;
  } = {},
): Promise<MintedDriver> {
  const u = await mintUser(req, 'driver', { displayName: opts.displayName });
  const create = await call<{ id: string }>(
    req, 'POST', '/drivers',
    { token: u.token, data: { full_name: u.displayName } },
  );
  if (create.status !== 200 || !create.data?.id) {
    throw new Error(`mintDriver profile-create failed: ${create.status} ${JSON.stringify(create.error)}`);
  }
  const driverId = create.data.id;

  if (opts.kyc && opts.kyc !== 'pending') {
    if (!opts.adminToken) throw new Error('mintDriver(kyc) requires opts.adminToken');
    const patch = await call(
      req, 'PATCH', `/drivers/${driverId}/kyc`,
      { token: opts.adminToken, data: { kyc_status: opts.kyc, note: 'e2e' } },
    );
    if (patch.status !== 200) {
      throw new Error(`mintDriver(kyc=${opts.kyc}) failed: ${patch.status} ${JSON.stringify(patch.error)}`);
    }
  }

  // TODO(wallet seed): once /wallet/admin/credit (or similar) lands, top up here.
  // For now, drivers start with their ₹1000 launch credit (auto-granted on signup).
  if (opts.cashPaise && opts.cashPaise > 0) {
    // best-effort placeholder — currently a no-op until the admin top-up endpoint exists
    void opts.cashPaise;
  }

  return { ...u, driverId };
}

/** Add a vehicle for a driver. Required to clear the "Add your vehicle" interstitial
 *  the verified-driver home redirects to when the driver has no vehicles. */
export async function mintVehicle(
  req: APIRequestContext,
  driverToken: string,
  opts: { carTypeId?: string; year?: number; registrationNumber?: string; seats?: number } = {},
): Promise<{ vehicleId: string }> {
  const carTypes = await getCarTypes(req);
  const body = {
    car_type_id: opts.carTypeId ?? carTypes[0]!.id,
    year: opts.year ?? 2024,
    registration_number: opts.registrationNumber ?? `TN-E2E-${Date.now().toString().slice(-6)}`,
    seats: opts.seats ?? 4,
  };
  const res = await call<{ id: string }>(req, 'POST', '/vehicles', { token: driverToken, data: body });
  if (res.status !== 200 || !res.data?.id) throw new Error(`mintVehicle failed: ${res.status} ${JSON.stringify(res.error)}`);
  return { vehicleId: res.data.id };
}

// ── agents ──────────────────────────────────────────────────────────────────

export interface MintedAgent extends MintedUser {
  agentId: string;
}

export async function mintAgent(
  req: APIRequestContext,
  opts: {
    adminToken?: string;
    kyc?: 'pending' | 'approved' | 'rejected';
    businessName?: string;
    displayName?: string;
  } = {},
): Promise<MintedAgent> {
  const u = await mintUser(req, 'trip_manager', { displayName: opts.displayName });
  const businessName = opts.businessName ?? `${u.displayName} Travels`;
  const create = await call<{ id: string }>(
    req, 'POST', '/agents',
    { token: u.token, data: { full_name: u.displayName, business_name: businessName } },
  );
  if (create.status !== 200 || !create.data?.id) {
    throw new Error(`mintAgent profile-create failed: ${create.status} ${JSON.stringify(create.error)}`);
  }
  const agentId = create.data.id;

  if (opts.kyc && opts.kyc !== 'pending') {
    if (!opts.adminToken) throw new Error('mintAgent(kyc) requires opts.adminToken');
    const patch = await call(
      req, 'PATCH', `/agents/${agentId}/kyc`,
      { token: opts.adminToken, data: { kyc_status: opts.kyc, note: 'e2e' } },
    );
    if (patch.status !== 200) {
      throw new Error(`mintAgent(kyc=${opts.kyc}) failed: ${patch.status} ${JSON.stringify(patch.error)}`);
    }
  }
  return { ...u, agentId };
}

// ── admin (no profile needed — role=admin user is sufficient for admin endpoints) ──

export async function mintAdmin(req: APIRequestContext, opts: { displayName?: string } = {}): Promise<MintedUser> {
  return mintUser(req, 'admin', { displayName: opts.displayName ?? uniqueName('admin') });
}

/** Set a user's cash-wallet sub-balance to an exact paise value. Admin Bearer required.
 *  Common use: drain a fresh driver's promo balance to ₹0 so the next trip completion 402s.
 *  Backed by `POST /admin/wallet/set-balance` which inserts an `adjustment` ledger row. */
export async function setWalletBalance(
  req: APIRequestContext,
  adminToken: string,
  userId: string,
  subBalance: 'promo' | 'cash' | 'transferred',
  targetPaise: number,
): Promise<void> {
  const res = await call(req, 'POST', '/admin/wallet/set-balance',
    { token: adminToken, data: { user_id: userId, sub_balance: subBalance, target_paise: targetPaise } });
  if (res.status !== 200) throw new Error(`setWalletBalance(${subBalance}=${targetPaise}) failed: ${res.status} ${JSON.stringify(res.error)}`);
}

/** Convenience: drain BOTH promo and cash sub-balances to ₹0 for a fresh-account guard test. */
export async function drainWallet(req: APIRequestContext, adminToken: string, userId: string): Promise<void> {
  await setWalletBalance(req, adminToken, userId, 'promo', 0);
  await setWalletBalance(req, adminToken, userId, 'cash', 0);
}

/** Transition a driver or agent profile's KYC status mid-test (admin Bearer required). */
export type KycStatus = 'pending' | 'docs_submitted' | 'video_pending' | 'ready_for_approval' | 'approved' | 'rejected' | 'resubmit_required';
export async function setKyc(
  req: APIRequestContext,
  adminToken: string,
  role: 'driver' | 'agent',
  profileId: string,
  status: KycStatus,
  note = 'e2e',
): Promise<void> {
  const path = role === 'driver' ? `/drivers/${profileId}/kyc` : `/agents/${profileId}/kyc`;
  const res = await call(req, 'PATCH', path, { token: adminToken, data: { kyc_status: status, note } });
  if (res.status !== 200) throw new Error(`setKyc(${role}=${status}) failed: ${res.status} ${JSON.stringify(res.error)}`);
}

// ── reference data (read-only, shared) ──────────────────────────────────────

let _cachedCities: { id: string; name: string; lat: number; lng: number }[] | null = null;
let _cachedCarTypes: { id: string; label: string }[] | null = null;

export async function getCities(req: APIRequestContext): Promise<{ id: string; name: string; lat: number; lng: number }[]> {
  if (_cachedCities) return _cachedCities;
  const res = await call<{ id: string; name: string; lat: number; lng: number }[]>(req, 'GET', '/admin/cities');
  _cachedCities = res.data ?? [];
  return _cachedCities;
}
export async function getCarTypes(req: APIRequestContext): Promise<{ id: string; label: string }[]> {
  if (_cachedCarTypes) return _cachedCarTypes;
  const res = await call<{ id: string; label: string }[]>(req, 'GET', '/admin/car-types');
  _cachedCarTypes = res.data ?? [];
  return _cachedCarTypes;
}

// ── trips ───────────────────────────────────────────────────────────────────

export interface TripOpts {
  fromCityId?: string;
  toCityId?: string;
  carTypeId?: string;
  pickupAt?: string;          // ISO; default = +4h
  expectedDistanceKm?: number;
  ratePerKm?: number;
  passengerName?: string;
  passengerPhone?: string;
  passengerCount?: number;
  hidePassengerPhone?: boolean;
  autoInviteMatches?: boolean; // default true (the feature shipped earlier)
}

/** Post a trip as the given agent. Resolves city + car-type defaults from /admin lookups. */
export async function postTrip(
  req: APIRequestContext,
  agentToken: string,
  opts: TripOpts = {},
): Promise<{ tripId: string }> {
  const cities = await getCities(req);
  const carTypes = await getCarTypes(req);
  const body = {
    from_city_id: opts.fromCityId ?? cities[0]!.id,
    to_city_id: opts.toCityId ?? cities[1]!.id,
    pickup_at: opts.pickupAt ?? new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    expected_distance_km: opts.expectedDistanceKm ?? 140,
    car_type_id: opts.carTypeId ?? carTypes[0]!.id,
    rate_per_km: opts.ratePerKm ?? 14,
    commission_pct: 10,
    gst_amount: 98,
    driver_bata: 300,
    passenger_name: opts.passengerName ?? 'e2e Pax',
    passenger_phone: opts.passengerPhone ?? '+918888888888',
    passenger_count: opts.passengerCount ?? 2,
    hide_passenger_phone: opts.hidePassengerPhone ?? false,
    auto_invite_matches: opts.autoInviteMatches ?? false, // default off — most tests don't want the fan-out
  };
  const res = await call<{ id: string }>(req, 'POST', '/trips', { token: agentToken, data: body });
  if (res.status !== 200 || !res.data?.id) {
    throw new Error(`postTrip failed: ${res.status} ${JSON.stringify(res.error)}`);
  }
  return { tripId: res.data.id };
}

export async function applyToTrip(
  req: APIRequestContext,
  driverToken: string,
  tripId: string,
  opts: { message?: string; quotedRatePerKm?: number } = {},
): Promise<{ acceptanceId: string }> {
  const res = await call<{ id: string }>(
    req, 'POST', `/trips/${tripId}/applicants`,
    { token: driverToken, data: { applicant_message: opts.message ?? 'e2e apply', applicant_quoted_rate_per_km: opts.quotedRatePerKm } },
  );
  if (res.status !== 200 || !res.data?.id) {
    throw new Error(`applyToTrip failed: ${res.status} ${JSON.stringify(res.error)}`);
  }
  return { acceptanceId: res.data.id };
}

export async function assignDriver(
  req: APIRequestContext,
  agentToken: string,
  tripId: string,
  acceptanceId: string,
): Promise<void> {
  const res = await call(req, 'POST', `/trips/${tripId}/assign`, { token: agentToken, data: { acceptance_id: acceptanceId } });
  if (res.status !== 200) throw new Error(`assignDriver failed: ${res.status} ${JSON.stringify(res.error)}`);
}

export async function acceptTrip(
  req: APIRequestContext,
  driverToken: string,
  tripId: string,
): Promise<{ passengerOtp: string }> {
  const res = await call<{ passenger_otp: string }>(req, 'POST', `/trips/${tripId}/accept`, { token: driverToken });
  if (res.status !== 200 || !res.data?.passenger_otp) {
    throw new Error(`acceptTrip failed: ${res.status} ${JSON.stringify(res.error)}`);
  }
  return { passengerOtp: res.data.passenger_otp };
}

/** Driver starts an accepted trip by verifying the passenger OTP + odometer capture. */
export async function startTrip(
  req: APIRequestContext,
  driverToken: string,
  tripId: string,
  passengerOtp: string,
  opts: { startOdoUrl?: string; startOdoReading?: number } = {},
): Promise<void> {
  const res = await call(req, 'POST', `/trips/${tripId}/start`, {
    token: driverToken,
    data: {
      passenger_otp: passengerOtp,
      start_odo_url: opts.startOdoUrl ?? 'test://odo/start',
      start_odo_reading: opts.startOdoReading ?? 10000,
    },
  });
  if (res.status !== 200) throw new Error(`startTrip failed: ${res.status} ${JSON.stringify(res.error)}`);
}

/** Driver completes an in-progress trip — fires the wallet trigger + the final-payout recompute. */
export async function completeTrip(
  req: APIRequestContext,
  driverToken: string,
  tripId: string,
  opts: { driverNotes?: string; endOdoUrl?: string; endOdoReading?: number; tollPaidByDriver?: number; driverReviewNote?: string } = {},
): Promise<{ status: number; error?: { code?: string; message?: string } | null }> {
  const res = await call(req, 'POST', `/trips/${tripId}/complete`, {
    token: driverToken,
    data: {
      driver_notes: opts.driverNotes ?? 'e2e',
      end_odo_url: opts.endOdoUrl ?? 'test://odo/end',
      end_odo_reading: opts.endOdoReading ?? 10100,
      toll_paid_by_driver: opts.tollPaidByDriver ?? 0,
      ...(opts.driverReviewNote ? { driver_review_note: opts.driverReviewNote } : {}),
    },
  });
  return { status: res.status, error: res.error };
}

/** Cancel a trip (poster only). Optional `cancelReasonId` from `cancel_reasons`. */
export async function cancelTrip(
  req: APIRequestContext,
  agentToken: string,
  tripId: string,
  opts: { cancelReasonId?: string } = {},
): Promise<void> {
  const res = await call(req, 'POST', `/trips/${tripId}/cancel`,
    { token: agentToken, data: opts.cancelReasonId ? { cancel_reason_id: opts.cancelReasonId } : {} });
  if (res.status !== 200) throw new Error(`cancelTrip failed: ${res.status} ${JSON.stringify(res.error)}`);
}

/** Transfer released referral earnings into the user's cash wallet (Earnings Transfer Credit). */
export async function transferReleasedToWallet(
  req: APIRequestContext,
  userToken: string,
  amountPaise: number,
): Promise<{ status: number; error?: { code?: string; message?: string } | null }> {
  const res = await call(req, 'POST', '/referrals/me/transfer-to-wallet',
    { token: userToken, data: { amount_paise: amountPaise } });
  return { status: res.status, error: res.error };
}

/** Request a UPI withdrawal of released referral earnings. */
export async function requestWithdrawal(
  req: APIRequestContext,
  userToken: string,
  amountPaise: number,
  upiId: string,
): Promise<{ status: number; withdrawalId?: string; error?: { code?: string; message?: string } | null }> {
  const res = await call<{ id: string }>(req, 'POST', '/referrals/me/withdraw',
    { token: userToken, data: { amount_paise: amountPaise, upi_id: upiId } });
  return { status: res.status, withdrawalId: res.data?.id, error: res.error };
}

/** Read trip — used as an API witness after UI actions. */
export async function getTrip(
  req: APIRequestContext,
  token: string,
  tripId: string,
): Promise<Record<string, unknown> | null> {
  const res = await call<Record<string, unknown>>(req, 'GET', `/trips/${tripId}`, { token });
  return res.data;
}

// ── vacancies ───────────────────────────────────────────────────────────────

export async function postVacancy(
  req: APIRequestContext,
  driverToken: string,
  opts: { currentCityId?: string; destinationCityIds?: string[]; notes?: string } = {},
): Promise<{ vacancyId: string }> {
  const cities = await getCities(req);
  const body = {
    current_city_id: opts.currentCityId ?? cities[0]!.id,
    destination_city_ids: opts.destinationCityIds ?? [cities[1]!.id],
    notes: opts.notes ?? 'e2e vacancy',
  };
  const res = await call<{ id: string }>(req, 'POST', '/vacancies', { token: driverToken, data: body });
  if (res.status !== 200 || !res.data?.id) {
    throw new Error(`postVacancy failed: ${res.status} ${JSON.stringify(res.error)}`);
  }
  return { vacancyId: res.data.id };
}

// ── UI auth (post-API) ──────────────────────────────────────────────────────

/**
 * Pre-authenticate a UI page by setting the JWT in localStorage before navigation. After this,
 * `page.goto('/')` lands on the role-correct home immediately — no UI sign-in dance per test.
 *
 * Must run before the first page.goto() that needs auth. Playwright's storage state is per-context,
 * so call this on each fresh page (tests can also use storageState for cross-test caching — out
 * of scope for now).
 */
export async function loginAs(page: Page, user: MintedUser): Promise<void> {
  // page.addInitScript runs before every navigation; we set the tokens in localStorage once.
  await page.addInitScript(
    ({ accessKey, refreshKey, token, refresh }) => {
      window.localStorage.setItem(accessKey, token);
      window.localStorage.setItem(refreshKey, refresh);
    },
    { accessKey: ACCESS_TOKEN_KEY, refreshKey: REFRESH_TOKEN_KEY, token: user.token, refresh: user.refreshToken },
  );
}
