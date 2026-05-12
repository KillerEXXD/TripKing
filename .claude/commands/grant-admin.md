---
description: Grant (or revoke) the `admin` role for a phone number — and optionally give them driver + agent profiles so the role switcher works
---

Set `public.users.role` for a phone number. **Usage:** `/grant-admin <phone> [role]` — `role` ∈ `admin` (default) | `driver` | `trip_manager` | `revoke` (→ `driver`). If `$1` (the phone) is missing, ask for it. There's no admin-provisioning UI yet (Phase-6 item — see `docs/SECURITY_REVIEW.md`), so this manual grant on the QA project is how you mint an admin.

## Steps

1. **Normalise the phone.** Users store phones as `+91XXXXXXXXXX`. If the input is 10 digits, prefix `+91`. Look it up:

```bash
node scripts/db.cjs "select id, phone, display_name, role from public.users where phone like '%<digits>%'"
```

If no row: tell the user they need to sign in once first (the `users` row is created on first `/auth/verify-otp`). Stop.

2. **Set the role** (target = `admin` unless `$2` says otherwise; `revoke` → `driver`):

```bash
node scripts/db.cjs "update public.users set role='<target>' where phone='<+91…>' returning id, phone, display_name, role"
```

3. **(Only when granting `admin`)** offer to also give them a `drivers` and a `trip_managers` profile so the admin "view as" role switcher (`HomeForRole` / `RoleSwitcher`) lets them preview the driver and agent homes. **Important:** insert these *directly* — do NOT call `POST /agents` / `POST /drivers`, which would sync `users.role` back to `driver`/`trip_manager` and un-admin them:

```bash
node scripts/db.cjs "insert into public.drivers (user_id, full_name, phone) select '<user-uuid>', coalesce(nullif(display_name,''),'Admin'), phone from public.users where id='<user-uuid>' on conflict (user_id) do nothing"
node scripts/db.cjs "insert into public.trip_managers (user_id, full_name, phone) select '<user-uuid>', coalesce(nullif(display_name,''),'Admin'), phone from public.users where id='<user-uuid>' on conflict (user_id) do nothing"
```

4. **Verify & report:**

```bash
node scripts/db.cjs "select (select role from public.users where id='<uuid>') users_role, (select count(*) from public.drivers where user_id='<uuid>') has_driver, (select count(*) from public.trip_managers where user_id='<uuid>') has_agent"
```

Tell the user: the change is in the DB now; they must **sign out and sign back in** (or hard-refresh) on `trip-king.vercel.app` so `GET /auth/me` re-fetches the new role. Then `/administration` loads (for admin), and the "Viewing as" bar at the top of `/` lets an admin flip between Admin / Driver / Agent.

Reminder: `verify-otp` no longer clobbers an existing user's role on sign-in (`fix(auth)`), so this grant sticks across re-logins.
