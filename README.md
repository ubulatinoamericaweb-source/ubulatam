# UBU Latinoamérica · sitio web (Astro)

Reconstrucción del sitio de **ubulatinoamerica.com**. Sitio estático generado con Astro; JavaScript solo donde una interacción lo necesita (GSAP en la portada, lista de cotización, formulario).

## Abrirlo en local

```bash
npm install
npm run dev        # http://127.0.0.1:4321  (desarrollo)
npm run build      # genera dist/ (62 páginas)
npm run preview    # sirve dist/ tal como saldrá a producción
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src/data/products.json` | **Catálogo centralizado.** 49 entradas con `order` explícito (orden del PDF), `page`, `slug`, `sbSlug`, precio COP, tablas y referencias. |
| `src/data/catalog.ts` | Tipos y ayudas (`byCategory` ordena siempre por `order`). |
| `src/data/brand-paths.json` | Trazos vectoriales del logo e isotipo, extraídos del manual de marca (no redibujados). |
| `src/components/` | `Logo`, `UbuFace` (carita decorativa), `Truck`, `Hands`, `PcHead`, `ProductCard`, `CategoryView`, `InnerHero`. |
| `src/pages/` | Inicio, `conectividad`, `hidrogel`, `catalogo`, `[slug]` (una ficha por producto), nosotros, para-tu-negocio, soporte, contacto, ubicación, cotización, legales, 404. |
| `src/scripts/` | `core.ts` (menú, carrito, ojos), `home.ts` (escenas GSAP), `cart.ts` (carrito de pedido), `inner.ts`. |
| `public/admin.html` | Panel administrativo existente (Supabase Auth), conservado sin cambios. |
| `supabase/schema.sql` | Esquema **sugerido**, no aplicado (ver «Supabase»). |
| `legacy-site/` | Sitio anterior (HTML suelto) como respaldo. No se publica; puede borrarse cuando se valide el nuevo. |
| `source-private/` | PDFs y referencias. Ignorada por git (`.gitignore` y `.git/info/exclude`); nada de ahí se copia a `public/`. |

## Carrito de pedido (sin pagos)

- Ruta `/carrito` (la antigua `/cotizacion` redirige). Acceso visible en el encabezado con contador.
- Se agregan productos desde tarjetas y fichas; los productos con variantes (**modelo de batería**, **referencia de vidrio**) se agregan por fila/lista y se pueden cambiar en el carrito. Cantidades con +/−, subtotal con los precios públicos.
- Pasos: 1 productos → 2 datos de entrega (nombre, teléfono, país, ciudad, dirección y confirmación) → 3 resumen → «Confirmar pedido» → botón **Enviar pedido por WhatsApp** (o «Copiar pedido»).
- No cobra ni inventa tarifas: el mensaje indica que costo y disponibilidad de envío se confirman por WhatsApp.
- **Privacidad:** solo los productos del carrito se guardan en `localStorage` (`ubu_quote`). Los datos de entrega viven en memoria y no se guardan ni se envían a Supabase ni a ningún servicio.

## Páginas «Nosotros» y canales

- «Nosotros» ya no explica el manual de marca (sin paleta, tipografías, reglas del logo ni espiral áurea): usa solo contenido comercial ya publicado (quiénes somos, qué ofrecemos, para quién, garantía de 365 días según el catálogo, Hayuelos).
- El grupo de botones de contacto (pie de página) usa **solo canales reales del proyecto**: WhatsApp, ubicación en Google Maps y catálogo PDF. El proyecto no contiene perfiles de redes sociales (Instagram, Facebook, etc.); si UBU los tiene, hay que entregar las URL para añadirlos. La carpeta `source-private/referencias/` no incluye la imagen «Electronics» mencionada.

## Comparar versiones y volver al punto de restauración

| Qué | Dónde |
|---|---|
| **Versión animada aprobada** (portada del camión en 2D, manos y personaje ilustrados) | `/` — intacta |
| **Alternativa realista (prueba, 3D con three.js)** | `/realista` — ruta aparte, `noindex`, fuera del sitemap |
| Botón de comparación | En `/` aparece «Comparar: versión realista (prueba)»; en `/realista`, la barra inferior «Ver la versión animada actual» |

La alternativa vive solo en `src/pages/realista.astro` y `src/scripts/realista/` (más `three` en `package.json` y un enlace en `Base.astro`). Los recursos de la versión animada (`Truck`, `Hands`, `PcHead`, `home.ts`) no se tocaron. Para descartarla: borra esos archivos y `npm uninstall three`.

**Punto de restauración local:** commit `01e6f91`, etiqueta `punto-restauracion-animada-v1` (rama `astro-rebuild`). Contiene la portada animada aprobada y no incluye `source-private`. Nada se ha subido a GitHub ni desplegado.

```bash
git tag                                        # ver etiquetas
git diff --stat punto-restauracion-animada-v1  # ver qué cambió desde entonces
git switch -c volver-a-animada punto-restauracion-animada-v1   # volver a esa versión en una rama nueva
# o, para recuperar solo un archivo:  git restore --source punto-restauracion-animada-v1 -- src/pages/index.astro
```

## Marca

- **Colores** (valores exactos del manual): Azul Silicon Valley `#4293D0`, Confianza Índigo `#405BA5`, Verde Cobre Oxidado `#56B28E`, Verde Armonía `#56B28E`, Blanco Pureza `#FFFFFF`, Asombro Turmalina `#41B9C1`, Gris Guernica `#575756`, Cian Realidad Virtual `#01DCEF`.
  **Duplicación en el manual (p. 5):** Verde Cobre Oxidado y Verde Armonía llevan el mismo HEX/RGB `#56B28E`/`86, 178, 142`, aunque la muestra de Armonía se ve más amarillenta y su CMYK difiere (67,4,54,0 en ambas filas del texto). Se conservó el dato; no se creó otro código. Conviene pedir al diseñador el valor correcto.
- Los neutros oscuros de fondo (`--tinta-*`) y de superficie (`--bruma`) son derivados para dar contraste; no son colores de marca.
- **Tipografías.** Harabara Mais y Century Gothic no están en el repositorio ni hay licencia web confirmada, así que se usan alternativas autoalojadas (sin Google Fonts): **Outfit** (títulos, cercana a Harabara Mais) y **Questrial** (texto, cercana a Century Gothic). Si UBU tiene las licencias, basta cambiar `--font-display` y `--font-body` en `src/styles/global.css`.
- **Logo/isotipo:** vectores extraídos de las páginas 2 y 7 del manual → `public/brand/` (color y blanco). La carita animada (`UbuFace`) es una pieza decorativa aparte: solo se mueven los ojos; el logo oficial nunca se anima.

## Catálogo y precios

- Fuente: `UBU 2026 SEP (5) 2.pdf`. Precios en **COP**, tal como aparecen. Dos categorías: **Conectividad** (26 entradas, p. 2–27) e **Hidrogel** (23, p. 28–49). El orden es el del PDF; los filtros de la web solo ocultan, nunca reordenan.
- Fotos reales extraídas del PDF (con transparencia), convertidas a WebP y optimizadas por Astro (`<Image>`).

### Datos del catálogo por confirmar

| Pág. | Observación |
|---|---|
| 27 | Última fila de «Batería Diagnostic»: *iPhone 15 Pro max*, capacidad impresa «>500Times» (parece ciclos, no mAh), $138.000. Se muestra tal cual. |
| 9 | El PDF dice «POWER BANG 10.000 MIH»; la web usa «Power bank 10.000 mAh» (el texto impreso se guarda en `printedName`). |
| 21 | Lista de vidrios copiada tal cual, incluidos «SANSUNG A 21S» y «SAMSUNG A 12». Esta página no trae foto. |
| 24 | «Batería y su presentación» no tiene precio. Su foto se reutiliza en las fichas de baterías (p. 25–27), que no traen foto propia; se indica en la ficha. |
| 12 y 19 | Los colores disponibles (audífonos: 3; balaca: 5) son puntos de color en el PDF, sin nombre; se muestran como muestras de color sin nombrarlos. |
| 28 | Etiqueta amarilla «RECLAME OBSEQUIO» en la máquina de 21": el PDF no explica las condiciones. |
| 22 | **Parlante Harman Kardon ($220.000) está en el PDF y no estaba en el sitio anterior**; ya se incluye. |

## Supabase

- El sitio anterior apuntaba a un proyecto de Supabase (`ksfabuzurjxofapqoonc`). Al consultarlo con la clave pública, **las tablas `productos`, `solicitudes` y `admins` no existen** (error `PGRST205`), por lo que la carga de precios en vivo y el panel `/admin` no podían funcionar. No se escribió ni modificó nada en Supabase.
- **Comparación de precios:** no hay precios activos en Supabase con los que comparar. Los 47 precios incrustados en el sitio anterior coinciden con el catálogo PDF (0 diferencias).
- La integración se conservó **desactivada por defecto**: si defines `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` (ver `.env.example`), el sitio superpone precios activos de `productos` y el formulario guarda una copia en `solicitudes`. Si no hay respuesta válida, se mantienen los precios del catálogo. Nunca va una `service_role` en el navegador.
- `supabase/schema.sql` propone tablas y políticas RLS (insertar solicitudes: público; leer/editar: solo `admins`). Revísalo antes de aplicarlo.
- `public/admin.html` sigue igual: usa `supabase-js@2.45.4` desde jsDelivr (sin SRI) y valida el rol consultando `admins`. La seguridad real depende de las políticas RLS, que hoy no existen en ese proyecto.

## SEO y dominio

Configurado: `<title>` y descripción por página, canonical, Open Graph/Twitter (`/og.png`), JSON-LD (Organization, WebSite, Product, ItemList, FAQPage), `sitemap-index.xml`, `robots.txt`, `noindex` en admin y lista de cotización, redirecciones de URLs antiguas en `vercel.json` (`/paginas/*`, `/productos/*`, `/legal/*`, `/maquinas`, `/accesorios`) y cabeceras de seguridad.

Depende de ti: apuntar el dominio `ubulatinoamerica.com` al proyecto de Vercel (DNS), enviar el sitemap en Search Console y verificar la propiedad.

## Pendientes legales y de contenido

- Las páginas `privacidad`, `cookies` y `terminos` son **borradores** del sitio anterior, actualizados para reflejar el sitio nuevo (sin Google Fonts ni banner de cookies; el formulario solo abre WhatsApp). Siguen marcados `[Pendiente: …]` (razón social, NIT, correo, fechas, etc.) y necesitan validación legal.
- `public/descargas/catalogo-ubu-2026.pdf` es el PDF público que ya existía (3 MB); no es el archivo de `source-private` (38 MB) y no se encontró «Harman» en su texto, así que probablemente no incluye ese producto. Si quieres actualizarlo, exporta una versión optimizada del PDF fuente y reemplázala.
- La escena de las manos y el personaje con cabeza de computador son ilustraciones originales hechas para este sitio, inspiradas en las referencias; no son fotografías ni una mascota oficial, y el personaje no es un asistente automatizado.
