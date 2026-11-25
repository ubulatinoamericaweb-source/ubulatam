/** Videos verticales de la sección "UBU en acción" (portada).
    Para publicar uno: pega la URL del video de TikTok en `tiktok` (p. ej. 'https://www.tiktok.com/@ubu/video/7412345678901234567'),
    la del Short de YouTube en `youtube`, o copia un MP4 vertical a public/videos/ y pon su ruta en `file`
    (p. ej. '/videos/maquina-11-9.mp4'). `poster` es opcional (imagen en public/). Sin video, la tarjeta muestra "Video próximamente". */
export interface Short { id: string; title: string; tiktok?: string; youtube?: string; file?: string; poster?: string; enabled?: boolean }

export const shorts: Short[] = [
  { id: 't1', title: 'Lo que necesitas, lo encuentras en UBU', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7707138963647008020' },
  { id: 't2', title: 'Innovación, calidad y novedades UBU', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7707144334382173460' },
  { id: 't3', title: 'Cargador 45 W: ¿aguanta la prueba?', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7704715980034952454' },
  { id: 't4', title: 'Hidrogel económico vs. hidrogel de calidad', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7650738751395679508' },
  { id: 't5', title: 'La máquina de hidrogel funciona sin WiFi', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7646616082530192660' },
  { id: 't6', title: 'Tres máquinas para ahorrar tiempo y dinero', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7644416971383082261' },
  { id: 't7', title: 'Hidrogel: más resistencia que el vidrio', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7623590560162467092' },
  { id: 't8', title: 'Mayoristas: UBU ya está disponible', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7696355685621075221' },
  { id: 't9', title: 'Power bank certificada para viajar en avión', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7709313739496983829' },
  { id: 't10', title: '¿Viajas? Ojo con tu power bank', tiktok: 'https://www.tiktok.com/@ubu.latinoamerica/video/7708587579498581266' },
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
