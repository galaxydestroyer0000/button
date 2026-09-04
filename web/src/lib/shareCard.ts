import { FACTIONS } from "../domain/factions";
import { numberToWord, shortAddress } from "../domain/format";
import type { IdentityCardData } from "../components/identity/IdentityCard";

const WIDTH = 1200;
const HEIGHT = 630;

function drawIdentityCard(ctx: CanvasRenderingContext2D, data: IdentityCardData): void {
  const f = FACTIONS[data.faction] ?? FACTIONS[0];

  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createRadialGradient(180, 60, 0, 180, 60, 700);
  gradient.addColorStop(0, `${f.color}22`);
  gradient.addColorStop(1, "#08080800");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, 10, HEIGHT);

  ctx.fillStyle = "#77746e";
  ctx.font = "800 22px ui-monospace, Menlo, monospace";
  ctx.fillText(`PRESS #${data.pressNumber.toLocaleString()}`, 80, 120);

  ctx.fillStyle = "#f7f4ed";
  ctx.font = "900 96px ui-monospace, Menlo, monospace";
  ctx.fillText(`${data.remaining} SECOND${data.remaining === 1 ? "" : "S"}`, 80, 230);

  ctx.fillStyle = f.color;
  ctx.font = "800 40px ui-monospace, Menlo, monospace";
  ctx.fillText(f.name, 80, 290);

  ctx.fillStyle = "#8c8982";
  ctx.font = "26px ui-monospace, Menlo, monospace";
  ctx.fillText(shortAddress(data.presser), 80, 335);

  ctx.fillStyle = "#c9c6bd";
  ctx.font = "italic 32px ui-monospace, Menlo, monospace";
  ctx.fillText(`"I waited until ${numberToWord(data.remaining)}."`, 80, 420);

  ctx.fillStyle = "#5f5c57";
  ctx.font = "700 20px ui-monospace, Menlo, monospace";
  ctx.fillText("BUTTON / RDDT — ONE PRESS FOREVER", 80, HEIGHT - 50);
}

/** Renders the identity card to an offscreen canvas and triggers a browser download
 *  as a PNG — entirely client-side, no server round trip. */
export function downloadIdentityCard(data: IdentityCardData): void {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  drawIdentityCard(ctx, data);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `button-press-${data.pressNumber}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
