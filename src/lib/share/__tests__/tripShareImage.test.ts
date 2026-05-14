import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderTripShareImage } from '@/lib/share/tripShareImage';

/**
 * jsdom doesn't ship a real canvas implementation. We stub the bits the renderer touches:
 *  - getContext('2d') returns a minimal mock that no-ops every draw call
 *  - toBlob resolves with a small PNG-shaped Blob
 * The test asserts the renderer wires the canvas calls and returns a usable File.
 */
function installCanvasMocks() {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
    textAlign: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    cb(blob);
  };
}

describe('renderTripShareImage', () => {
  beforeEach(() => {
    installCanvasMocks();
  });

  it('returns a PNG File named tripking-trip.png', async () => {
    const file = await renderTripShareImage({
      route: 'Tiruchirappalli → Hosur',
      pickup: 'Fri, 15 May, 6:00 am',
      vehicle: 'Toyota Innova · 7 seats · AC',
      otp: '654321',
      url: 'https://trip-king.vercel.app/passenger/654321',
    });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('tripking-trip.png');
    expect(file.size).toBeGreaterThan(0);
  });

  it('throws when the canvas 2D context is unavailable', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    await expect(
      renderTripShareImage({ route: 'A → B', pickup: 'now', vehicle: 'Sedan', otp: '000000', url: 'https://x/0' }),
    ).rejects.toThrow(/Canvas 2D context unavailable/);
  });
});
