import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/alert';
import { createAlert, deleteAlert, getAlert, getMyAlerts, setAlertActive, updateAlert } from '@/lib/api/services/alerts';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformAlert').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'toApiAlert').mockImplementation(() => ({ stub: true }) as never);
});

describe('alerts service', () => {
  it('getMyAlerts → GET /alerts', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'a1' }]) as never);
    const list = await getMyAlerts();
    expect(get).toHaveBeenCalledWith('/alerts');
    expect(list[0]?.id).toBe('a1');
  });

  it('getAlert throws EmptyResponseError on null body', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(null) as never);
    await expect(getAlert('a1')).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it('createAlert → POST /alerts with the toApiAlert body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'a1' }) as never);
    await createAlert({} as never);
    expect(post).toHaveBeenCalledWith('/alerts', { stub: true });
  });

  it('updateAlert → PATCH /alerts/:id with the toApiAlert body', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'a1' }) as never);
    await updateAlert('a1', {} as never);
    expect(patch).toHaveBeenCalledWith('/alerts/a1', { stub: true });
  });

  it('setAlertActive(true) clears paused_at; setAlertActive(false) sets it to an ISO timestamp', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'a1' }) as never);
    await setAlertActive('a1', true);
    expect(patch).toHaveBeenLastCalledWith('/alerts/a1', { is_active: true, paused_at: null });
    await setAlertActive('a1', false);
    const lastCall = patch.mock.calls[patch.mock.calls.length - 1] as [string, { is_active: boolean; paused_at: string }];
    const body = lastCall[1];
    expect(body.is_active).toBe(false);
    expect(body.paused_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('deleteAlert → DELETE /alerts/:id, resolves void', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockReturnValue(ok(null) as never);
    await expect(deleteAlert('a1')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('/alerts/a1');
  });
});
