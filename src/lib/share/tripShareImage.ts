/**
 * Render a square branded trip card the agent can attach to their WhatsApp
 * "Share with passenger" message. Pure client — uses an off-screen canvas;
 * no DOM mount, no server, no external dep. Returns a File ready to hand to
 * `navigator.share({ files: [...] })`.
 *
 * Layout (1080×1080):
 *   - emerald header strip (200 px) with the TripKing wordmark + "Trip confirmed"
 *   - route line — auto-shrinks if a long city name doesn't fit
 *   - pickup time (secondary)
 *   - vehicle + seats (secondary)
 *   - boxed band with `PASSENGER OTP` label + big 96 px digits
 *   - footer with the passenger URL
 */
export interface TripShareImageInput {
  route: string;
  pickup: string;
  vehicle: string;
  otp: string;
  url: string;
}

const W = 1080;
const H = 1080;
const EMERALD = '#10b981';
const EMERALD_DARK = '#047857';
const SLATE_900 = '#0f172a';
const SLATE_500 = '#64748b';
const SLATE_100 = '#f1f5f9';
const SLATE_200 = '#e2e8f0';
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function drawAutoShrinkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: string,
): void {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.fillText(text, x, y);
}

export async function renderTripShareImage(input: TripShareImageInput): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Emerald header strip
  ctx.fillStyle = EMERALD;
  ctx.fillRect(0, 0, W, 200);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.font = `800 56px ${FONT_STACK}`;
  ctx.fillText('TripKing', 64, 60);
  ctx.font = `500 28px ${FONT_STACK}`;
  ctx.fillText('Trip confirmed — for your passenger', 64, 130);

  // Route (auto-shrink)
  ctx.fillStyle = SLATE_900;
  ctx.font = `800 64px ${FONT_STACK}`;
  drawAutoShrinkText(ctx, input.route, 64, 270, W - 128, 64, 36, '800');

  // Pickup
  ctx.fillStyle = SLATE_500;
  ctx.font = `500 30px ${FONT_STACK}`;
  ctx.fillText(`Pickup · ${input.pickup}`, 64, 360);

  // Vehicle
  if (input.vehicle) {
    ctx.fillText(input.vehicle, 64, 410);
  }

  // OTP band
  const bandY = 510;
  const bandH = 280;
  ctx.fillStyle = SLATE_100;
  ctx.strokeStyle = SLATE_200;
  ctx.lineWidth = 2;
  roundRect(ctx, 64, bandY, W - 128, bandH, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = EMERALD_DARK;
  ctx.font = `700 28px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('PASSENGER OTP', W / 2, bandY + 38);

  ctx.fillStyle = SLATE_900;
  ctx.font = `800 140px ${FONT_STACK}`;
  // letter-spacing approximation — draw each char with a gap
  const otp = input.otp;
  const gap = 18;
  ctx.font = `800 140px ${FONT_STACK}`;
  const charWidths = otp.split('').map((c) => ctx.measureText(c).width);
  const totalWidth = charWidths.reduce((s, w) => s + w, 0) + gap * (otp.length - 1);
  let cx = (W - totalWidth) / 2;
  let i = 0;
  for (const c of otp) {
    ctx.textAlign = 'left';
    ctx.fillText(c, cx, bandY + 90);
    cx += charWidths[i]! + gap;
    i++;
  }

  // Footer — passenger URL
  ctx.fillStyle = SLATE_500;
  ctx.font = `500 26px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Open the trip — tap the link in the message:', W / 2, 880);
  ctx.fillStyle = EMERALD_DARK;
  ctx.font = `600 28px ${FONT_STACK}`;
  drawAutoShrinkText(ctx, input.url, 64, 925, W - 128, 28, 18, '600');
  ctx.textAlign = 'left';
  // Reset text alignment after the centered block above used left for the OTP chars
  ctx.textAlign = 'center';
  ctx.fillStyle = SLATE_500;
  ctx.font = `500 22px ${FONT_STACK}`;
  ctx.fillText('Powered by TripKing — outstation cab marketplace', W / 2, 1010);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas toBlob returned null');
  return new File([blob], 'tripking-trip.png', { type: 'image/png' });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
