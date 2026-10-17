// PLACEHOLDER images for the duck pond game of the book (ente, kueken, boot): the real drawings do not exist yet.
// They are drawn into small canvases and registered with pgz.addImage; a dashed frame marks them as placeholders.
// An asset pack with these names (e.g. 'book') replaces them automatically, because packs come before page images.

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  const k = 3; // drawn at 3x, so they stay sharp when the game is scaled up
  c.width = w * k; c.height = h * k;
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  draw(ctx);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(0, 0, 0, .35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  return c;
}

function ellipse(ctx, x, y, rx, ry, fill, stroke) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

/** Register the placeholder images with a Pygame Zero host (createPgzero). */
export function addPondPlaceholders(pgz) {
  const duck = canvas(56, 48, (ctx) => {
    ellipse(ctx, 26, 32, 22, 13, '#ffffff', '#5b6b7a');
    ellipse(ctx, 38, 16, 11, 11, '#ffffff', '#5b6b7a');
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.moveTo(47, 14); ctx.lineTo(55, 18); ctx.lineTo(47, 21); ctx.closePath(); ctx.fill();
    ellipse(ctx, 41, 13, 2, 2, '#1f2937');
  });
  const chick = canvas(40, 36, (ctx) => {
    ellipse(ctx, 18, 24, 14, 10, '#fde047', '#a16207');
    ellipse(ctx, 27, 12, 8, 8, '#fde047', '#a16207');
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(34, 11); ctx.lineTo(39, 14); ctx.lineTo(34, 16); ctx.closePath(); ctx.fill();
    ellipse(ctx, 29, 10, 1.5, 1.5, '#1f2937');
  });
  const boat = canvas(120, 56, (ctx) => {
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(116, 30); ctx.lineTo(100, 52); ctx.lineTo(18, 52); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(40, 10, 40, 20);
    ctx.strokeRect(40, 10, 40, 20);
    ctx.fillStyle = '#93c5fd';
    for (const x of [46, 58, 70]) ctx.fillRect(x, 15, 6, 6);
  });
  // the canvases have 3x the pixels; the third argument is the size in game pixels
  pgz.addImage('ente', duck, [56, 48]).addImage('kueken', chick, [40, 36]).addImage('boot', boat, [120, 56]);
}
