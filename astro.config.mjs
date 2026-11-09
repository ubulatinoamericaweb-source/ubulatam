import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Prueba interna /realista (3D): solo existe en desarrollo (npm run dev). En producción NO se genera ni se publica,
// salvo que se compile expresamente con PUBLIC_ENABLE_REALISTA=1.
const realista = {
  name: 'ubu-realista',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev' || process.env.PUBLIC_ENABLE_REALISTA === '1') injectRoute({ pattern: '/realista', entrypoint: './src/lab/realista.astro' });
    },
  },
};

// Rutas que NO van al sitemap (privadas, redirecciones o sin valor de búsqueda).
// LEGAL_PENDIENTES: páginas legales en borrador; quitarlas de esta lista (y su noindex) cuando estén completas.
const LEGAL_PENDIENTES = ['privacidad', 'cookies', 'terminos'];
const NO_INDEXAR = ['carrito', '404', 'maquinas', 'accesorios', 'cotizacion', 'admin', 'realista', ...LEGAL_PENDIENTES];

// Sitio estático: las URLs se sirven sin .html gracias a "cleanUrls" en vercel.json.
// Dominio canónico de producción: https://www.ubulatinoamerica.com
export default defineConfig({
  site: 'https://www.ubulatinoamerica.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [realista, sitemap({ filter: (u) => !NO_INDEXAR.some((r) => u.endsWith('/' + r)) })],
  redirects: {
    '/cotizacion': '/carrito',
    '/maquinas': '/hidrogel#maquinas',
    '/accesorios': '/conectividad',
  },
  vite: { build: { chunkSizeWarningLimit: 700 } },
});
