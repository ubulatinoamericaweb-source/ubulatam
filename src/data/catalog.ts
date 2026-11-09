import raw from './products.json';

export type Category = 'conectividad' | 'hidrogel';

export interface ProductImage { file: string; alpha: boolean; w: number; h: number }
export interface Product {
  /** Orden explícito del catálogo PDF (1 = primer producto). No cambiar. */
  order: number;
  /** Página del catálogo PDF donde aparece. */
  page: number;
  category: Category;
  type: string;
  slug: string;
  sbSlug: string;
  name: string;
  printedName: string;
  price: number | null;
  unit: string;
  from: boolean;
  features: string[];
  images: ProductImage[];
  table?: { head: string[]; rows: { model: string; capacity: string; price: number }[] };
  references?: string[];
  colors?: string[];
  sticker?: string;
  heading?: string;
  info?: boolean;
  newOnWeb?: boolean;
}

/** Siempre ordenado por `order`: nunca por nombre, precio ni popularidad. */
export const products: Product[] = (raw as Product[]).slice().sort((a, b) => a.order - b.order);

export const categories: Record<Category, { slug: Category; name: string; short: string; intro: string }> = {
  conectividad: {
    slug: 'conectividad',
    name: 'Conectividad',
    short: 'Cargadores, cables, audio, vidrios y baterías',
    intro: 'Carga, cables, audio, vidrios blindados y baterías para iPhone, en el orden de nuestro catálogo 2026.',
  },
  hidrogel: {
    slug: 'hidrogel',
    name: 'Hidrogel',
    short: 'Máquinas, láminas e insumos de instalación',
    intro: 'Máquinas de corte libres de códigos, láminas de hidrogel y las herramientas para instalarlas.',
  },
};

export const byCategory = (c: Category) => products.filter((p) => p.category === c);
export const bySlug = (s: string) => products.find((p) => p.slug === s);
export const pick = (...slugs: string[]) => slugs.map((s) => bySlug(s)!).filter(Boolean);

export const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function priceLabel(p: Product): string {
  if (p.price == null) return 'Sin precio en el catálogo';
  return (p.from ? 'Desde ' : '') + cop(p.price) + (p.unit ? ' ' + p.unit : '');
}

export const WA_NUMBER = '573043724012';
export const WA_DISPLAY = '+57 304 372 4012';
export const waUrl = (text: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
export const waProduct = (p: Product) =>
  waUrl(`Hola UBU Latinoamérica, quiero cotizar: ${p.name} (${priceLabel(p)} COP, ref. catálogo 2026). ¿Me confirman disponibilidad?`);
export const waGeneric = waUrl('Hola UBU Latinoamérica, quiero información y una cotización. Los encontré en la página web.');
export const waAdvice = waUrl('Hola UBU Latinoamérica, tengo un negocio (tienda o servicio técnico) y quiero asesoría sobre máquinas e insumos de hidrogel.');

// Imágenes optimizadas por Astro (src/assets/productos).
const imgs = import.meta.glob<{ default: ImageMetadata }>('../assets/productos/*.webp', { eager: true });
export function productImage(file: string): ImageMetadata {
  const m = imgs[`../assets/productos/${file}`];
  if (!m) throw new Error('Imagen de producto no encontrada: ' + file);
  return m.default;
}

/** Foto del catálogo para un producto. Las tablas de baterías usan la foto "Batería y su presentación" (p. 24). */
export function displayImages(p: Product): ProductImage[] {
  if (p.images.length) return p.images;
  if (p.type === 'Batería') return bySlug('bateria-y-su-presentacion')?.images ?? [];
  return [];
}
