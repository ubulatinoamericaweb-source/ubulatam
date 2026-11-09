import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitio estático: las URLs se sirven sin .html gracias a "cleanUrls" en vercel.json.
export default defineConfig({
  site: 'https://ubulatinoamerica.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap({ filter: (u) => !/\/(carrito|404|maquinas|accesorios|admin|realista)$/.test(u) })],
  redirects: {
    '/cotizacion': '/carrito',
    '/maquinas': '/hidrogel#maquinas',
    '/accesorios': '/conectividad',
  },
  vite: { build: { chunkSizeWarningLimit: 700 } },
});
