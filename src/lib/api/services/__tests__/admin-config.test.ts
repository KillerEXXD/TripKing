import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { carTypesApi, vehicleMakesApi, getAppSettings, updateAppSettings, getVehicleModelsForMake } from '@/lib/api/services/admin-config';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

describe('admin-config service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('carTypesApi.list → GET /admin/car-types, mapped via transformLookup', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'c1', label: 'Sedan', sort_order: 20, is_active: true }]) as never);
    const rows = await carTypesApi.list();
    expect(get).toHaveBeenCalledWith('/admin/car-types', undefined);
    expect(rows).toEqual([{ id: 'c1', label: 'Sedan', sortOrder: 20, isActive: true }]);
  });

  it('carTypesApi.list({includeInactive}) → ?include_inactive=true', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await carTypesApi.list({ includeInactive: true });
    expect(get).toHaveBeenCalledWith('/admin/car-types', { include_inactive: true });
  });

  it('carTypesApi.create → POST /admin/car-types with snake_case body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'new', label: 'SUV', sort_order: 30, is_active: true }) as never);
    const row = await carTypesApi.create({ label: 'SUV', sortOrder: 30 });
    expect(post).toHaveBeenCalledWith('/admin/car-types', { label: 'SUV', sort_order: 30 });
    expect(row.label).toBe('SUV');
  });

  it('carTypesApi.setActive → PATCH /admin/car-types/:id { is_active }', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'c1', label: 'Sedan', sort_order: 20, is_active: false }) as never);
    const row = await carTypesApi.setActive('c1', false);
    expect(patch).toHaveBeenCalledWith('/admin/car-types/c1', { is_active: false });
    expect(row.isActive).toBe(false);
  });

  it('carTypesApi.reorder → PATCH /admin/car-types/reorder { ids }', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok(null) as never);
    await carTypesApi.reorder(['a', 'b', 'c']);
    expect(patch).toHaveBeenCalledWith('/admin/car-types/reorder', { ids: ['a', 'b', 'c'] });
  });

  it('vehicleMakesApi.create sends `name` (not `label`)', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'mk', name: 'Kia', sort_order: 70, is_active: true }) as never);
    await vehicleMakesApi.create({ label: 'Kia', sortOrder: 70 });
    expect(post).toHaveBeenCalledWith('/admin/vehicle-makes', { name: 'Kia', sort_order: 70 });
  });

  it('getVehicleModelsForMake → GET /admin/vehicle-models?make_id=', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'vm', make_id: 'mk', name: 'Carens', default_seats: 7, sort_order: 10 }]) as never);
    const rows = await getVehicleModelsForMake('mk');
    expect(get).toHaveBeenCalledWith('/admin/vehicle-models', { make_id: 'mk', include_inactive: undefined });
    expect(rows[0].name).toBe('Carens');
  });

  it('app-settings get/update', async () => {
    const settings = {
      min_vehicle_year: 2015,
      vehicle_expiry_warning_days: 90,
      default_alert_radius_km: 25,
      default_commission_pct: 10,
      default_gst_pct: 5,
      default_driver_bata: 300,
      default_extras_paid_by_passenger: true,
      default_driver_instructions: 'x',
    };
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(settings) as never);
    const s = await getAppSettings();
    expect(s.minVehicleYear).toBe(2015);

    const put = vi.spyOn(apiClient, 'put').mockReturnValue(ok({ ...settings, default_commission_pct: 12 }) as never);
    const updated = await updateAppSettings({ defaultCommissionPct: 12 });
    expect(put).toHaveBeenCalledWith('/admin/app-settings', { default_commission_pct: 12 });
    expect(updated.defaultCommissionPct).toBe(12);
  });
});
