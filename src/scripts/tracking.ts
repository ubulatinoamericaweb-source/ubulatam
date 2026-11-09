/* PREPARACIÓN (INERTE) para Meta Pixel + API de Conversiones. NO está conectada a nada y no envía datos.
   Nada importa este archivo todavía: no se incluye en la compilación hasta que alguien lo use.

   Reglas para cuando se implemente:
   1. Solo con consentimiento de marketing: window.ubuConsent.get() === 'granted' (ver consent.ts). Sin consentimiento, no se envía nada.
   2. DEDUPLICACIÓN: el MISMO evento enviado por Pixel (navegador) y por CAPI (servidor) debe llevar el MISMO nombre y el MISMO
      identificador. Aquí se genera UNA vez por evento (eventId) y se usa en ambos canales:
         navegador →  fbq('track', nombre, parámetros, { eventID: eventId })
         servidor  →  { event_name: nombre, event_id: eventId, event_time, event_source_url, action_source: 'website', ... }
   3. El token de CAPI es un SECRETO DE SERVIDOR: variable sin prefijo PUBLIC_ (p. ej. META_CAPI_ACCESS_TOKEN), nunca en el navegador,
      en el código ni en Git. El ID del Pixel sí es público (PUBLIC_META_PIXEL_ID) cuando exista.
   4. No enviar a Meta mensajes de WhatsApp, direcciones de entrega, datos de pago ni datos personales directos sin confirmación expresa
      y una necesidad concreta. Los datos de contacto que se envíen a CAPI deben ir con hash (SHA-256) según Meta, solo si se aprueba.
   5. Pruebas: usar únicamente el «código de evento de prueba» de Meta cuando exista; no enviar eventos de prueba antes. */

export const TRACKING_READY = false; // se pondrá en true solo cuando existan el ID del Pixel y el endpoint de servidor para CAPI

export function newEventId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export interface TrackResult { eventId: string; sent: boolean }

/** Devuelve el eventId compartido; hoy NO envía nada (TRACKING_READY = false y sin consentimiento). */
export function track(_name: string, _params: Record<string, unknown> = {}): TrackResult {
  const eventId = newEventId();
  const consent = (globalThis as { ubuConsent?: { get: () => string } }).ubuConsent?.get();
  if (!TRACKING_READY || consent !== 'granted') return { eventId, sent: false };
  // Futuro: 1) fbq('track', _name, _params, { eventID: eventId });  2) enviar { event_name: _name, event_id: eventId, ... } al endpoint de servidor de CAPI.
  return { eventId, sent: false };
}
