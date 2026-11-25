/** Videos verticales de la sección "UBU en acción" (portada).
    Para publicar uno: pega la URL del video de TikTok en `tiktok` (p. ej. 'https://www.tiktok.com/@ubu/video/7412345678901234567'),
    la del Short de YouTube en `youtube`, o copia un MP4 vertical a public/videos/ y pon su ruta en `file`
    (p. ej. '/videos/maquina-11-9.mp4'). `poster` es opcional (imagen en public/). Sin video, la tarjeta muestra "Video próximamente". */
export interface Short { id: string; title: string; tiktok?: string; youtube?: string; file?: string; poster?: string; enabled?: boolean }

export const shorts: Short[] = [
  { id: 's1', title: 'Máquina de hidrogel 11,9" UV en funcionamiento' },
  { id: 's2', title: 'Corte en máquina de 21 pulgadas' },
  { id: 's3', title: 'Instalación de hidrogel paso a paso' },
  { id: 's4', title: 'Curado de hidrogel UV' },
  { id: 's5', title: 'Cambio de cuchilla' },
  { id: 's6', title: 'Laminación con bomba de vacío' },
];

/** ID de un video de YouTube a partir de su URL (shorts, watch, youtu.be o embed). */
export function ytId(url = ''): string | null {
  const m = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** ID numérico de un video de TikTok a partir de su URL completa (los enlaces cortos vm.tiktok.com no traen el ID). */
export function tiktokId(url = ''): string | null {
  const m = url.match(/\/video\/(\d{8,})/);
  return m ? m[1] : null;
}
