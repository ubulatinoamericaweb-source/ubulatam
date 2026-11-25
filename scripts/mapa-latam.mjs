// Genera src/data/mapa-latam.json (mapa de Latinoamérica + posición de productos) para src/components/MapaLatam.astro.
// Uso: node scripts/mapa-latam.mjs <ne_50m_admin_0_countries.geojson>
// El geojson (Natural Earth, dominio público) se descarga aparte y no va al repo.
import fs from 'node:fs';
import path from 'node:path';

const [geoFile] = process.argv.slice(2);
const outFile = new URL('../src/data/mapa-latam.json', import.meta.url);
const geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'));

const MAIN = ['MEX','GTM','BLZ','HND','SLV','NIC','CRI','PAN','CUB','HTI','DOM','PRI','COL','VEN','ECU','PER','BOL','CHL','ARG','URY','PRY','BRA'];
const MUTED = ['GUY','SUR'];

// Transversa de Mercator esférica (conforme: no deforma Caribe ni Centroamérica), meridiano central -76.
const L0 = -76 * Math.PI / 180;
function proj([lon, lat]) {
  const l = lon * Math.PI / 180 - L0, p = lat * Math.PI / 180;
  const B = Math.cos(p) * Math.sin(l);
  return [0.5 * Math.log((1 + B) / (1 - B)), -Math.atan2(Math.tan(p), Math.cos(l))];
}
const keepPoly = (iso, ring) => {
  const lon = ring.reduce((a, c) => a + c[0], 0) / ring.length;
  if (iso === 'ECU' && lon < -85) return false; // Galápagos
  if (iso === 'CHL' && lon < -80) return false; // Isla de Pascua, Juan Fernández
  if (iso === 'COL' && lon < -80) return false; // Malpelo
  return true;
};
const countries = [];
for (const f of geo.features) {
  const iso = f.properties.ADM0_A3;
  let polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  let kind = MAIN.includes(iso) ? 'main' : MUTED.includes(iso) ? 'muted' : null;
  if (iso === 'FRA') { // Guayana Francesa viene dentro de Francia
    polys = polys.filter(p => { const c = p[0][0]; return c[0] > -56 && c[0] < -50 && c[1] > 1 && c[1] < 7; });
    if (polys.length) kind = 'muted';
  }
  if (!kind) continue;
  polys = polys.filter(p => keepPoly(iso, p[0]));
  countries.push({ iso: iso === 'FRA' ? 'GUF' : iso, kind, polys: polys.map(p => p.map(r => r.map(proj))) });
}

// Escala a 1000 unidades de ancho.
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const c of countries) for (const p of c.polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const PAD = 14, W = 1000, k = (W - 2 * PAD) / (x1 - x0), H = Math.round((y1 - y0) * k + 2 * PAD);
for (const c of countries) c.polys = c.polys.map(p => p.map(r => r.map(([x, y]) => [(x - x0) * k + PAD, (y - y0) * k + PAD])));

// Douglas-Peucker
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); };
const ringPath = r => { let s = '', px = 0, py = 0; r.forEach(([x, y], i) => { x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10; if (i === 0) s += `M${x} ${y}`; else s += `l${+(x - px).toFixed(1)} ${+(y - py).toFixed(1)}`; px = x; py = y; }); return s + 'z'; };
for (const c of countries) {
  c.polys = c.polys.map(p => p.map(r => { const h = r.length >> 1; return [...dp(r.slice(0, h + 1), 0.45), ...dp(r.slice(h), 0.45).slice(1)]; })).filter(p => p[0].length >= 4 && (area(p[0]) > 4 || c.iso === 'PRI'));
  c.d = c.polys.map(p => p.filter(r => r.length >= 4).map(ringPath).join('')).join('').replace(/l(-?[\d.]+) (-?[\d.]+)/g, (m, a, b) => `l${a}${b.startsWith('-') ? '' : ' '}${b}`);
}

// Punto en polígono (con huecos)
const inRing = (x, y, r) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; };
const inCountry = (x, y, c) => c.polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));

// Productos: todos los del catálogo que tienen foto.
const MACH = /^maquina-/, MED = /^(hidrogel-|audifonos|balaca|parlante)/;
const catalog = JSON.parse(fs.readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'));
const prods = catalog.filter((p) => p.images?.length).map((p) => ({ slug: p.slug, file: p.images[0].file, size: MACH.test(p.slug) ? 'l' : MED.test(p.slug) ? 'm' : 's' }));
console.log('productos', prods.length);

// Tamaño en px en escritorio (mapa a ~1100 px => 1.1 px por unidad)
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const PXU = 1.1, RANGE = { l: [140, 166], m: [86, 104], s: [58, 70] };
for (const p of prods) { const [a, b] = RANGE[p.size]; p.px = Math.round(a + rnd() * (b - a)); p.r = p.px / PXU / 2; }

// Orden mezclado: alterna tamaños.
const bySize = { l: prods.filter(p => p.size === 'l'), m: prods.filter(p => p.size === 'm'), s: prods.filter(p => p.size === 's') };
for (const k2 in bySize) bySize[k2].sort(() => rnd() - .5);
const order = [];
while (order.length < prods.length) for (const k2 of ['l', 's', 'm', 's', 'm']) if (bySize[k2].length) order.push(bySize[k2].shift());

// Cupo por país: 1 mínimo, el resto proporcional al área.
const main = countries.filter(c => c.kind === 'main');
for (const c of main) c.area = c.polys.reduce((a, p) => a + area(p[0]), 0);
const totA = main.reduce((a, c) => a + c.area, 0);
for (const c of main) { c.quota = 1 + (prods.length - main.length) * c.area / totA; c.got = 0; }
// Candidatos dentro de cada país (centro + 4 puntos a 0.4r dentro)
const fits = (x, y, r, c) => x - r * 1.7 > 0 && x + r * 1.7 < W && inCountry(x, y, c) && [[1,0],[-1,0],[0,1],[0,-1]].every(([a, b]) => inCountry(x + a * r * .4, y + b * r * .4, c));
const placed = [];
const GAP = 1;
// 1.ª pasada: un producto pequeño en cada país, empezando por los más chicos.
const smalls = order.filter(p => p.size === 's').sort((a, b) => a.px - b.px);
for (const c of [...main].sort((a, b) => a.area - b.area)) {
  const p = smalls.shift(); p.px = Math.min(p.px, 56); p.r = p.px / PXU / 2; p.only = c;
}
order.sort((a, b) => (b.only ? 1 : 0) - (a.only ? 1 : 0));
for (const p of order) {
  // Los grandes no caben en países pequeños.
  const cands = p.only ? [p.only] : main.filter(c => c.area > (p.size === "l" ? 6000 : p.size === "m" ? 800 : 0)).sort((a, b) => (b.quota - b.got) - (a.quota - a.got));
  let done = false;
  for (const c of cands) {
    let best = null, bestD = -Infinity;
    const xs = c.polys.flatMap(q => q[0]);
    const bx0 = Math.min(...xs.map(v => v[0])), bx1 = Math.max(...xs.map(v => v[0])), by0 = Math.min(...xs.map(v => v[1])), by1 = Math.max(...xs.map(v => v[1]));
    for (let t = 0; t < 4000; t++) {
      const x = bx0 + rnd() * (bx1 - bx0), y = by0 + rnd() * (by1 - by0);
      if (!(p.only ? inCountry(x, y, c) : fits(x, y, p.r, c))) continue;
      const d = Math.min(...placed.map(q => Math.hypot(q.x - x, q.y - y) - q.r - p.r), 999);
      if (d < (p.only ? -26 : p.retry ? -22 : GAP)) continue;
      if (d > bestD) { bestD = d; best = [x, y]; }
      if (bestD > 60) break;
    }
    if (best) { Object.assign(p, { x: best[0], y: best[1], iso: c.iso }); placed.push(p); c.got++; done = true; break; }
  }
  if (!done && !p.retry) { p.retry = true; delete p.only; order.push(p); } else if (!done) console.warn('sin sitio', p.slug);
}
console.log('por país', main.map(c => `${c.iso}:${c.got}`).join(' '));

// Subconjunto para celular: separación mayor.
placed.sort((a, b) => a.y - b.y);
const mob = [];
for (const p of [...placed].sort((a, b) => ({ l: 0, m: 1, s: 2 })[a.size] - ({ l: 0, m: 1, s: 2 })[b.size])) {
  if (mob.every(q => Math.hypot(q.x - p.x, q.y - p.y) > (q.r + p.r) * 1.0 + 70)) mob.push(p);
}
for (const p of placed) p.mobile = mob.includes(p);
console.log('celular', mob.length);

const r2 = (v) => +v.toFixed(2);
const DUR = { l: 6.4, m: 4.8, s: 3.6 };
const items = placed.map((p) => ({ slug: p.slug, file: p.file, size: p.size, px: p.px, x: r2(p.x / W * 100), y: r2(p.y / H * 100), m: p.mobile, d: r2(rnd() * DUR[p.size]), g: r2(rnd() * 7) }));
const mainD = countries.filter(c => c.kind === 'main').map(c => c.d).join('');
const mutedD = countries.filter(c => c.kind === 'muted').map(c => c.d).join('');
fs.writeFileSync(outFile, JSON.stringify({ W, H, main: mainD, muted: mutedD, items }));
console.log('W', W, 'H', H, 'items', items.length, 'celular', mob.length);
