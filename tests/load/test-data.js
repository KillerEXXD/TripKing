/**
 * The weighted endpoint mix for the TripKing load test. Public reads dominate; a few authed reads
 * (GET /trips now requires a Bearer, plus /drivers/me, /notifications, /alerts); one light write
 * (POST /places find-or-create — idempotent on the same lat/lng, and per-IP rate-limited, so under
 * load it'll 429, which `hit()` treats as expected). The `near_*` variants use a Bangalore-ish point
 * so the PostGIS radius queries actually have geog to filter on.
 *
 * `tokens` is the object returned by scenario.setup() — { user, driver }.
 */
const NEAR = 'near_lat=12.97&near_lng=77.59&radius_km=25';
export function getRequests(tokens) {
  const t = tokens && tokens.user;     // a generic authed user (trip_manager)
  const d = tokens && tokens.driver;   // an authed driver (has a /drivers/me profile)
  return [
    { w: 4, name: 'admin-lists',           method: 'GET',  path: '/admin/cities' },
    { w: 5, name: 'places-search',          method: 'GET',  path: '/places/search?q=Madurai&limit=5' },
    { w: 6, name: 'trips-list',             method: 'GET',  path: '/trips?status=open,has_applicants&limit=20', token: t },
    { w: 3, name: 'trips-list-radius',      method: 'GET',  path: `/trips?${NEAR}&limit=20`, token: t },
    { w: 5, name: 'vacancies-list',         method: 'GET',  path: '/vacancies?status=active&limit=20' },
    { w: 3, name: 'vacancies-list-radius',  method: 'GET',  path: `/vacancies?${NEAR}&limit=20` },
    { w: 4, name: 'drivers-list',           method: 'GET',  path: '/drivers?limit=20' },
    { w: 3, name: 'drivers-list-radius',    method: 'GET',  path: `/drivers?${NEAR}&limit=20` },
    { w: 3, name: 'drivers-me',             method: 'GET',  path: '/drivers/me', token: d },
    { w: 2, name: 'agents-list',            method: 'GET',  path: '/agents?limit=20' },
    { w: 3, name: 'notifications-list',     method: 'GET',  path: '/notifications', token: t },
    { w: 2, name: 'alerts-list',            method: 'GET',  path: '/alerts', token: t },
    { w: 3, name: 'reviews-list',           method: 'GET',  path: '/reviews?limit=20' },
    { w: 1, name: 'places-create',          method: 'POST', path: '/places', body: { provider: 'loadtest', name: 'Load Pt', lat: 12.97, lng: 77.59 } },
  ];
}
