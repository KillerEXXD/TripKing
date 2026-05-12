import { describe, it, expect } from 'vitest';
import {
  DriverTransformError,
  toApiCreateAgentProfile,
  toApiCreateDriverProfile,
  toApiUpdateDriver,
  transformAgent,
  transformDriver,
} from '@/lib/api/transforms/driver';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sort_order: 10, is_active: true });

describe('transformDriver', () => {
  it('maps a full driver with joined cities + vehicle summaries', () => {
    const d = transformDriver({
      id: 'd1',
      user_id: 'u1',
      full_name: 'Ravi Kumar',
      phone: '+919999999999',
      home_city: city('c1', 'Vellore'),
      current_city: city('c2', 'Chennai'),
      current_lat: 13.08,
      current_lng: 80.27,
      profile_photo_url: 'https://x/p.jpg',
      kyc_status: 'approved',
      rating_avg: 4.8,
      rating_count: 42,
      rating_distribution: { '1': 0, '2': 1, '3': 2, '4': 9, '5': 30 },
      top_tags: ['Punctual', 'Clean car'],
      manager_top_tags: ['Reliable'],
      total_trips_completed: 51,
      vehicles: [{ id: 'v1', make: { name: 'Toyota' }, model: { name: 'Innova Crysta' }, year: 2021, car_type: { label: 'Innova' }, seats: 7, ac: true }],
    });
    expect(d.fullName).toBe('Ravi Kumar');
    expect(d.homeCity?.name).toBe('Vellore');
    expect(d.currentCity?.name).toBe('Chennai');
    expect(d.kycStatus).toBe('approved');
    expect(d.ratingDistribution['5']).toBe(30);
    expect(d.topTags).toEqual(['Punctual', 'Clean car']);
    expect(d.vehicles[0]?.makeLabel).toBe('Toyota');
    expect(d.vehicles[0]?.carTypeLabel).toBe('Innova');
  });
  it('defaults missing optionals and throws on missing id / user_id', () => {
    const d = transformDriver({ id: 'd2', user_id: 'u2' });
    expect(d.homeCity).toBeUndefined();
    expect(d.homePlace).toBeUndefined();
    expect(d.currentPlace).toBeUndefined();
    expect(d.distanceKm).toBeUndefined();
    expect(d.vehicles).toEqual([]);
    expect(d.ratingDistribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
    expect(() => transformDriver({ user_id: 'u2' })).toThrow(DriverTransformError);
    expect(() => transformDriver({ id: 'd2' })).toThrow(/MISSING_USER_ID/);
  });
  it('maps the joined current_place / home_place and a radius-list distance_km', () => {
    const place = (id: string, name: string, lat: number, lng: number) => ({ id, provider: 'nominatim', provider_place_id: `N${id}`, name, formatted_address: `${name}, India`, state: 'Tamil Nadu', country: 'IN', lat, lng, is_active: true, created_at: '2026-05-26T00:00:00Z' });
    const d = transformDriver({ id: 'd3', user_id: 'u3', home_place: place('p1', 'Katpadi', 12.97, 79.13), current_place: place('p2', 'Guindy, Chennai', 13.01, 80.21), current_lat: 13.01, current_lng: 80.21, distance_km: 2.4 });
    expect(d.homePlace?.name).toBe('Katpadi');
    expect(d.currentPlace?.name).toBe('Guindy, Chennai');
    expect(d.distanceKm).toBe(2.4);
  });
});

describe('transformAgent', () => {
  it('maps an agent with a joined business city', () => {
    const a = transformAgent({ id: 'a1', user_id: 'u3', full_name: 'Agent A', phone: '+91', business_name: 'A Travels', business_city: city('c1', 'Vellore'), kyc_status: 'approved', top_tags: ['Pays on time'], total_trips_posted: 120 });
    expect(a.businessName).toBe('A Travels');
    expect(a.businessCity?.name).toBe('Vellore');
    expect(a.totalTripsPosted).toBe(120);
  });
});

describe('toApiUpdateDriver', () => {
  it('converts camelCase → snake_case and drops undefined', () => {
    expect(toApiUpdateDriver({ fullName: 'New Name', currentCityId: 'c9' })).toEqual({ full_name: 'New Name', current_city_id: 'c9' });
    expect(toApiUpdateDriver({})).toEqual({});
  });
});

describe('toApiCreateDriverProfile', () => {
  it('always sends role/full_name/home_city_id; email only when supplied', () => {
    expect(toApiCreateDriverProfile({ fullName: 'Ravi', homeCityId: 'c1' })).toEqual({ role: 'driver', full_name: 'Ravi', home_city_id: 'c1' });
    expect(toApiCreateDriverProfile({ fullName: 'Ravi', homeCityId: 'c1', email: 'r@x.com' })).toEqual({
      role: 'driver',
      full_name: 'Ravi',
      home_city_id: 'c1',
      email: 'r@x.com',
    });
  });
});

describe('toApiCreateAgentProfile', () => {
  it('sends role:trip_manager + business_city_id; email/business_name only when supplied', () => {
    expect(toApiCreateAgentProfile({ fullName: 'Agent A', businessCityId: 'c1' })).toEqual({ role: 'trip_manager', full_name: 'Agent A', business_city_id: 'c1' });
    expect(toApiCreateAgentProfile({ fullName: 'Agent A', businessCityId: 'c1', email: 'a@x.com', businessName: 'A Travels' })).toEqual({
      role: 'trip_manager',
      full_name: 'Agent A',
      business_city_id: 'c1',
      email: 'a@x.com',
      business_name: 'A Travels',
    });
  });
});
