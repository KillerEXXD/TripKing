import { describe, it, expect } from 'vitest';
import { VacancyTransformError, toApiPostVacancy, transformVacancy } from '@/lib/api/transforms/vacancy';
import { AlertTransformError, toApiAlert, transformAlert } from '@/lib/api/transforms/alert';
import type { AlertInput, PostVacancyInput } from '@/types';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sort_order: 10, is_active: true });
const place = (id: string, name: string, lat: number, lng: number) => ({ id, provider: 'nominatim', provider_place_id: `N${id}`, name, formatted_address: `${name}, India`, state: 'Tamil Nadu', country: 'IN', lat, lng, is_active: true, created_at: '2026-05-26T00:00:00Z' });

describe('transformVacancy', () => {
  it('maps a vacancy with driver, current city, and destination cities', () => {
    const v = transformVacancy({
      id: 'vac1',
      driver_id: 'd1',
      driver: { id: 'd1', full_name: 'Ravi', profile_photo_url: '', rating_avg: 4.7, rating_count: 9, total_trips_completed: 20, top_tags: ['Polite'], current_city: city('c1', 'Vellore') },
      current_city: city('c1', 'Vellore'),
      available_from: '2026-06-01T06:00:00Z',
      destination_cities: [city('c2', 'Chennai'), city('c3', 'Bangalore')],
      min_rate_per_km: 12,
      status: 'active',
      created_at: '2026-05-25T05:00:00Z',
    });
    expect(v.currentCity.name).toBe('Vellore');
    expect(v.destinationCities.map((c) => c.name)).toEqual(['Chennai', 'Bangalore']);
    expect(v.driver?.fullName).toBe('Ravi');
    expect(v.minRatePerKm).toBe(12);
  });
  it('accepts the vacancy_destinations junction shape and throws on missing id / driver_id / current_city', () => {
    const v = transformVacancy({ id: 'vac2', driver_id: 'd1', current_city: city('c1', 'Vellore'), vacancy_destinations: [{ city: city('c2', 'Chennai') }] });
    expect(v.destinationCities[0]?.name).toBe('Chennai');
    expect(v.destinationPlaces).toEqual([]);
    expect(() => transformVacancy({ driver_id: 'd1', current_city: city('c1', 'V') })).toThrow(VacancyTransformError);
    expect(() => transformVacancy({ id: 'x', current_city: city('c1', 'V') })).toThrow(/MISSING_DRIVER_ID/);
    expect(() => transformVacancy({ id: 'x', driver_id: 'd1' })).toThrow(/MISSING_CURRENT_CITY/);
  });
  it('maps current_place, destination places from the junction, and distance_km', () => {
    const v = transformVacancy({
      id: 'vac3',
      driver_id: 'd1',
      current_city: city('c1', 'Vellore'),
      current_place: place('p1', 'Katpadi, Vellore', 12.9698, 79.1336),
      vacancy_destinations: [
        { city: city('c2', 'Chennai'), place: place('p2', 'Mahabalipuram', 12.6269, 80.1927) },
        { city: null, place: place('p3', 'Tirupati Bus Stand', 13.6288, 79.4192) },
      ],
      distance_km: 4.2,
    });
    expect(v.currentPlace?.name).toBe('Katpadi, Vellore');
    expect(v.destinationCities.map((c) => c.name)).toEqual(['Chennai']);
    expect(v.destinationPlaces.map((p) => p.name)).toEqual(['Mahabalipuram', 'Tirupati Bus Stand']);
    expect(v.distanceKm).toBe(4.2);
  });
});

describe('transformAlert', () => {
  it('maps an alert with from/to cities and filters notify channels', () => {
    const a = transformAlert({
      id: 'al1',
      user_id: 'u1',
      name: 'Vellore → Chennai > ₹14/km',
      from_city: city('c1', 'Vellore'),
      from_radius_km: 30,
      to_city: city('c2', 'Chennai'),
      to_radius_km: 25,
      min_rate_per_km: 14,
      car_type_ids: ['ct1', 'ct2'],
      notify_via: ['in_app', 'push', 'bogus'],
      is_active: true,
      created_at: '2026-05-26T05:00:00Z',
    });
    expect(a.fromCity.name).toBe('Vellore');
    expect(a.toCity?.name).toBe('Chennai');
    expect(a.notifyVia).toEqual(['in_app', 'push']);
    expect(a.carTypeIds).toEqual(['ct1', 'ct2']);
  });
  it('defaults notifyVia and throws on missing id / user_id / from_city', () => {
    expect(transformAlert({ id: 'x', user_id: 'u1', from_city: city('c1', 'V') }).notifyVia).toEqual(['in_app']);
    expect(() => transformAlert({ user_id: 'u1', from_city: city('c1', 'V') })).toThrow(AlertTransformError);
    expect(() => transformAlert({ id: 'x', from_city: city('c1', 'V') })).toThrow(/MISSING_USER_ID/);
    expect(() => transformAlert({ id: 'x', user_id: 'u1' })).toThrow(/MISSING_FROM_CITY/);
  });
  it('maps from_place / to_place when joined', () => {
    const a = transformAlert({ id: 'al2', user_id: 'u1', from_city: city('c1', 'Vellore'), from_place: place('p1', 'Katpadi', 12.97, 79.13), to_city: city('c2', 'Chennai'), to_place: place('p2', 'Tambaram', 12.92, 80.12) });
    expect(a.fromPlace?.name).toBe('Katpadi');
    expect(a.toPlace?.name).toBe('Tambaram');
  });
});

describe('toApi* writers', () => {
  it('toApiPostVacancy (place ids null when absent; passed through when given)', () => {
    const input: PostVacancyInput = { currentCityId: 'c1', availableFrom: '2026-06-01T06:00:00Z', destinationCityIds: ['c2', 'c3'], minRatePerKm: 12 };
    expect(toApiPostVacancy(input)).toEqual({
      vehicle_id: null,
      current_city_id: 'c1',
      current_place_id: null,
      available_from: '2026-06-01T06:00:00Z',
      available_until: null,
      destination_city_ids: ['c2', 'c3'],
      destination_place_ids: null,
      min_rate_per_km: 12,
      notes: null,
    });
    const withPlaces = toApiPostVacancy({ ...input, currentPlaceId: 'p1', destinationPlaceIds: ['p2', 'p3'] });
    expect(withPlaces.current_place_id).toBe('p1');
    expect(withPlaces.destination_place_ids).toEqual(['p2', 'p3']);
  });
  it('toApiAlert drops undefined; carries from/to place ids when given', () => {
    const input: Partial<AlertInput> = { name: 'X', fromCityId: 'c1', fromRadiusKm: 25, notifyVia: ['in_app'] };
    expect(toApiAlert(input)).toEqual({ name: 'X', from_city_id: 'c1', from_radius_km: 25, notify_via: ['in_app'] });
    expect(toApiAlert({})).toEqual({});
    expect(toApiAlert({ fromPlaceId: 'p1', toPlaceId: 'p2' })).toEqual({ from_place_id: 'p1', to_place_id: 'p2' });
  });
});
