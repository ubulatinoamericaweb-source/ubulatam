/* Página de lista de cotización: lee localStorage (vía core.ts) y arma el mensaje de WhatsApp. */
import { qGet, qSet, type QItem } from './core';
import { WA_NUMBER } from '../data/catalog';

interface PInfo { n: string; p: string; t: number; from: boolean; u: string; img: string; blend: boolean }
const data: Record<string, PInfo> = JSON.parse(document.getElementById('q-data')?.textContent || '{}');
const $ = (id: string) => document.getElementById(id)!;
const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function render() {
  const list = qGet().filter((i) => data[i.id]);
  $('q-empty').hidden = list.length > 0;
  $('q-box').hidden = list.length === 0;
  const ul = $('q-list');
  ul.replaceChildren();
  let total = 0, uncertain = false;
  list.forEach((it) => {
    const d = data[it.id];
    if (d.t && !d.from) total += d.t * it.qty; else uncertain = true;
    const li = document.createElement('li'); li.className = 'quote-row';
    const img = document.createElement('img'); img.alt = ''; img.src = d.img || '/favicon.svg'; img.width = 84; img.height = 84; img.loading = 'lazy'; if (d.blend) img.style.mixBlendMode = 'multiply';
    const mid = document.createElement('div');
    const a = document.createElement('a'); a.href = '/' + it.id; a.textContent = d.n; a.style.fontFamily = 'var(--font-display)'; a.style.fontWeight = '600';
    const pr = document.createElement('div'); pr.textContent = d.p + (d.p.startsWith('$') ? ' COP' : ''); pr.style.color = 'var(--texto-suave)'; pr.style.fontSize = '.92rem';
    mid.append(a, pr);
    const qty = document.createElement('div'); qty.className = 'qty'; qty.setAttribute('role', 'group'); qty.setAttribute('aria-label', 'Cantidad de ' + d.n);
    const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Menos');
    const out = document.createElement('output'); out.textContent = String(it.qty);
    const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Más');
    qty.append(minus, out, plus);
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn btn--sm btn--line rm'; rm.textContent = 'Quitar';
    const set = (fn: (l: QItem[]) => QItem[]) => { qSet(fn(qGet())); render(); };
    minus.onclick = () => set((l) => l.map((x) => (x.id === it.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)));
    plus.onclick = () => set((l) => l.map((x) => (x.id === it.id ? { ...x, qty: Math.min(999, x.qty + 1) } : x)));
    rm.onclick = () => set((l) => l.filter((x) => x.id !== it.id));
    li.append(img, mid, qty, rm); ul.append(li);
  });
  $('q-sum').textContent = total ? `Total estimado: ${cop(total)} COP` : 'Lista lista para enviar';
  const lines = ['Hola UBU Latinoamérica, quiero cotizar esta lista:', ...list.map((i) => `• ${i.qty} x ${data[i.id].n} (${data[i.id].p}${data[i.id].p.startsWith('$') ? ' COP' : ''})`), '¿Me confirman precio final y disponibilidad?'];
  ($('q-send') as HTMLAnchorElement).href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  if (uncertain) $('q-note').hidden = false;
}
$('q-clear').addEventListener('click', () => { qSet([]); render(); });
render();
