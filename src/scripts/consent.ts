/* Consentimiento de cookies de marketing (Meta Pixel / API de Conversiones, PLANEADOS).
   - Estado por defecto: SIN decidir = desactivado. Nada de marketing se activa hasta que la persona acepte.
   - Solo guarda la elección en el navegador (localStorage, clave ubu_consent). No envía nada a ningún servicio.
   - Este módulo NO carga Pixel ni CAPI. Cuando existan, deben engancharse a window.ubuConsent.onChange / get() === 'granted'
     (ver src/scripts/tracking.ts). */
export type Consent = 'granted' | 'denied' | 'unset';
const KEY = 'ubu_consent';

function read(): Consent {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.v === 1 && typeof v.marketing === 'boolean') return v.marketing ? 'granted' : 'denied';
  } catch { /* almacenamiento bloqueado: se trata como «sin decidir» */ }
  return 'unset';
}
function write(marketing: boolean) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, marketing })); } catch { /* sin almacenamiento: la elección vale solo en esta visita */ }
  document.dispatchEvent(new CustomEvent('ubu:consent', { detail: { marketing } }));
}

declare global { interface Window { ubuConsent?: { get: () => Consent; onChange: (fn: (marketing: boolean) => void) => void; open: () => void } } }

const banner = document.querySelector<HTMLElement>('[data-cb]');
const modal = document.querySelector<HTMLElement>('[data-cm]');
if (banner && modal) {
  const box = modal.querySelector<HTMLElement>('.cm__box')!;
  const toggle = modal.querySelector<HTMLInputElement>('[data-cm-marketing]')!;
  let opener: HTMLElement | null = null;

  const showBanner = () => { banner.hidden = false; };
  const hideBanner = () => { banner.hidden = true; };
  const openModal = (from?: HTMLElement | null) => {
    opener = from || (document.activeElement as HTMLElement | null);
    toggle.checked = read() === 'granted';
    hideBanner(); modal.hidden = false; document.documentElement.classList.add('cm-open');
    box.querySelector<HTMLElement>('button, input')?.focus();
  };
  const closeModal = () => {
    modal.hidden = true; document.documentElement.classList.remove('cm-open');
    if (read() === 'unset') showBanner();
    opener?.focus?.();
  };
  const decide = (marketing: boolean) => { write(marketing); hideBanner(); if (!modal.hidden) closeModal(); };

  banner.querySelector('[data-cb-accept]')!.addEventListener('click', () => decide(true));
  banner.querySelector('[data-cb-reject]')!.addEventListener('click', () => decide(false));
  banner.querySelector('[data-cb-config]')!.addEventListener('click', (e) => openModal(e.currentTarget as HTMLElement));
  modal.querySelector('[data-cm-accept]')!.addEventListener('click', () => decide(true));
  modal.querySelector('[data-cm-reject]')!.addEventListener('click', () => decide(false));
  modal.querySelector('[data-cm-save]')!.addEventListener('click', () => decide(toggle.checked));
  modal.querySelectorAll('[data-cm-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-consent-open]');
    if (b) openModal(b);
  });
  addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll<HTMLElement>('button, input, a[href]')].filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  if (read() === 'unset') showBanner();
  window.ubuConsent = { get: read, onChange: (fn) => document.addEventListener('ubu:consent', (e) => fn((e as CustomEvent).detail.marketing)), open: () => openModal() };
}
