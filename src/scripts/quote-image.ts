/* Imagen PNG del resumen de pedido, dibujada en un <canvas> con recursos locales (logo oficial y fuentes del sitio).
   Nada sale del navegador. La altura crece según las filas: no se recorta ningún producto. */

export interface QuoteRow { name: string; variant: string; qty: number; unit: number; total: number; img: string; blend: boolean }
export interface QuoteData { rows: QuoteRow[]; fields: [string, string][]; sub: number; date: string }

const W = 1080, M = 56;
const C = { ink: '#05101B', ink2: '#0F2436', soft: '#4A5A66', line: '#D9E4EA', mist: '#EAF6F7', teal: '#41B9C1', cyan: '#01DCEF' };
const DISPLAY = '"Outfit Variable", Questrial, system-ui, sans-serif';
const BODY = 'Questrial, "Century Gothic", "Segoe UI", system-ui, sans-serif';
const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MAX_PIXELS = 14e6; // límite seguro de área del canvas en móviles

const load = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function renderQuote(q: QuoteData): Promise<Blob> {
  await Promise.all(['600 20px "Outfit Variable"', '700 20px "Outfit Variable"', '400 20px Questrial'].map((f) => document.fonts.load(f, 'Aáéñ$0123')));
  const [logo, ...pics] = await Promise.all([load('/brand/ubu-logo-blanco.svg'), ...q.rows.map((r) => load(r.img))]);
  if (!logo) throw new Error('No se pudo cargar el logo de UBU.');

  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  const wrap = (t: string, w: number, font: string) => {
    g.font = font; const out: string[] = []; let cur = '';
    for (const word of t.split(/\s+/)) {
      const test = cur ? `${cur} ${word}` : word;
      if (g.measureText(test).width <= w || !cur) cur = test; else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur); return out;
  };

  // ---- medir ----
  const NAME = `600 26px ${DISPLAY}`, VAR = `400 21px ${BODY}`, NW = 410;
  const rows = q.rows.map((r) => {
    const n = wrap(r.name, NW, NAME), v = r.variant ? wrap(r.variant, NW, VAR) : [];
    return { n, v, h: Math.max(112, n.length * 32 + v.length * 27 + 16) + 28 };
  });
  const HEAD = 250, TITLE = 120;
  const HALF = (W - 2 * M - 72) / 2;
  const cells = q.fields.map(([k, v]) => {
    const full = k === 'Dirección', lines = wrap(v, full ? W - 2 * M - 48 : HALF, `600 24px ${DISPLAY}`);
    return { k, lines, full, h: 30 + lines.length * 30 + 14, x: 0, y: 0 };
  });
  let cy = 0;
  for (let i = 0; i < cells.length;) {
    const a = cells[i], b = !a.full && cells[i + 1] && !cells[i + 1].full ? cells[i + 1] : null;
    a.y = cy; if (b) { b.y = cy; b.x = 1; }
    cy += Math.max(a.h, b?.h || 0); i += b ? 2 : 1;
  }
  const CUST = cells.length ? cy + 56 : 0;
  const HDRROW = 56, TOTALS = 270, FOOT = 110;
  const H = HEAD + TITLE + CUST + HDRROW + rows.reduce((a, r) => a + r.h, 0) + TOTALS + FOOT;

  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (W * H)));
  cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
  g.scale(scale, scale);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);

  const text = (t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

  // ---- encabezado ----
  const grad = g.createLinearGradient(0, 0, W, HEAD); grad.addColorStop(0, '#0B2236'); grad.addColorStop(1, C.ink);
  g.fillStyle = grad; g.fillRect(0, 0, W, HEAD);
  const glow = g.createRadialGradient(W, 0, 0, W, 0, 520); glow.addColorStop(0, 'rgba(65,185,193,.5)'); glow.addColorStop(1, 'rgba(65,185,193,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, HEAD);
  const lh = 110, lw = lh * (logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 506.511 / 240.347);
  g.drawImage(logo, M, 56, lw, lh);
  text('Resumen de pedido', W - M, 100, `700 40px ${DISPLAY}`, '#fff', 'right');
  text(q.date, W - M, 144, `400 24px ${BODY}`, C.teal, 'right');
  g.fillStyle = C.cyan; g.fillRect(0, HEAD - 6, W, 6);

  let y = HEAD + 70;
  text('Cotización · precios de referencia del catálogo 2026', M, y, `400 23px ${BODY}`, C.soft);
  y = HEAD + TITLE;

  // ---- cliente ----
  if (cells.length) {
    rr(M, y - 8, W - 2 * M, CUST - 32, 20); g.fillStyle = C.mist; g.fill();
    cells.forEach((c) => {
      const x = M + 24 + (c.x ? HALF + 24 : 0), cyy = y + 22 + c.y;
      text(c.k.toUpperCase(), x, cyy, `600 17px ${DISPLAY}`, C.soft);
      c.lines.forEach((l, j) => text(l, x, cyy + 32 + j * 30, `600 24px ${DISPLAY}`, C.ink2));
    });
    y += CUST;
  }

  // ---- tabla ----
  const XQ = 690, XU = 855, XT = W - M;
  text('PRODUCTO', M, y + 30, `600 17px ${DISPLAY}`, C.soft);
  text('CANT.', XQ, y + 30, `600 17px ${DISPLAY}`, C.soft, 'center');
  text('PRECIO', XU, y + 30, `600 17px ${DISPLAY}`, C.soft, 'right');
  text('SUBTOTAL', XT, y + 30, `600 17px ${DISPLAY}`, C.soft, 'right');
  g.fillStyle = C.ink2; g.fillRect(M, y + 44, W - 2 * M, 2);
  y += HDRROW;
  rows.forEach((m, i) => {
    const r = q.rows[i], top = y + 14;
    rr(M, top, 112, 112, 14); g.fillStyle = C.mist; g.fill();
    const im = pics[i];
    if (im) {
      const s = Math.min(96 / im.naturalWidth, 96 / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
      g.save(); rr(M, top, 112, 112, 14); g.clip();
      if (r.blend) g.globalCompositeOperation = 'multiply';
      g.drawImage(im, M + (112 - w) / 2, top + (112 - h) / 2, w, h); g.restore();
    }
    const tx = M + 136; let ty = top + 30;
    m.n.forEach((l) => { text(l, tx, ty, NAME, C.ink); ty += 32; });
    m.v.forEach((l) => { text(l, tx, ty - 2, VAR, C.soft); ty += 27; });
    const my = top + 38;
    text(String(r.qty), XQ, my, `700 28px ${DISPLAY}`, C.ink, 'center');
    text(cop(r.unit), XU, my, `400 24px ${BODY}`, C.ink2, 'right');
    text(cop(r.total), XT, my, `700 26px ${DISPLAY}`, C.ink, 'right');
    g.fillStyle = C.line; g.fillRect(M, y + m.h - 1, W - 2 * M, 1.5);
    y += m.h;
  });

  // ---- totales ----
  y += 28;
  const lab = `400 26px ${BODY}`, val = `600 28px ${DISPLAY}`;
  text('Subtotal', XT - 330, y + 26, lab, C.soft); text(`${cop(q.sub)} COP`, XT, y + 26, val, C.ink2, 'right');
  text('Envío', XT - 330, y + 76, lab, C.soft); text('Por confirmar', XT, y + 76, val, C.ink2, 'right');
  rr(M, y + 110, W - 2 * M, 96, 22); g.fillStyle = C.ink; g.fill();
  text('TOTAL', M + 32, y + 172, `600 26px ${DISPLAY}`, C.cyan);
  text(`${cop(q.sub)} COP`, XT - 32, y + 174, `700 44px ${DISPLAY}`, '#fff', 'right');
  y += 206;
  text('El total no incluye envío. El valor final y el envío se confirman por WhatsApp.', M, y + 50, `400 21px ${BODY}`, C.soft);
  text('www.ubulatinoamerica.com', W / 2, H - 28, `600 20px ${DISPLAY}`, C.teal, 'center');

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('El navegador no pudo crear la imagen.'))), 'image/png'));
}
