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
| `src/pages/admin.astro` + `src/scripts/admin.ts` | Panel `/admin`: mostrar/ocultar productos y editar precio cliente final y mayorista. Enlace discreto «Administración» al final del menú hamburguesa. |
| `src/pages/mayoristas.astro` | `/mayoristas`: acceso mayorista (usuario global) y cierre de sesión. |
| `src/scripts/pricing.ts` | Precios en vivo, productos ocultos y vista mayorista; lo usan todas las páginas y el carrito. |
| `supabase/schema.sql`, `supabase/seed.sql` | Esquema con RLS y carga inicial de productos (ver «Supabase»). Deben aplicarse a mano. |
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

## Contactos y zoom de fichas

- **Contacto** (`/contacto`): datos en `src/data/contacts.ts`, agrupados por área (Gerencia, Ventas, Facturación y cartera). Cada teléfono es un enlace `tel:` y cada botón abre WhatsApp con ese número y un mensaje inicial según el área. El formulario permite elegir a quién escribir; por defecto usa la línea general de WhatsApp ya publicada (+57 304 372 4012).
- **Zoom de imagen** (`src/scripts/zoom.ts`): solo en la imagen grande de cada ficha. Escritorio: sigue al cursor y vuelve al salir. Celular: un toque amplía, arrastrar recorre, pellizcar amplía/reduce, otro toque o «Quitar zoom» lo devuelve. Las tarjetas del catálogo no lo tienen.

## Publicidad y medición con Meta (PLANEADO — nada instalado ni activo)

Hoy el sitio **no** tiene Meta Pixel, API de Conversiones, Vercel Analytics ni Speed Insights. Lo que sí está preparado:

- **Textos legales** (`privacidad`, `cookies`, `terminos`): describen el uso planeado y sus categorías de datos, sin afirmar que esté activo.
- **Panel de cookies** (`src/components/ConsentBanner.astro`, `src/scripts/consent.ts`): aceptar, rechazar y configurar las cookies de marketing; **rechazar es tan fácil como aceptar** y todo queda desactivado hasta que la persona acepte. Solo guarda la elección en el navegador (`ubu_consent`). Está **apagado por defecto**: se activa compilando con `PUBLIC_MARKETING_CONSENT=1` (bandera pública, no un secreto), pensado para encenderse junto con el Pixel.
- **Deduplicación** (`src/scripts/tracking.ts`, inerte y sin importar desde ninguna página): un mismo evento enviado por Pixel y por CAPI debe llevar el **mismo nombre y el mismo `event_id`** (`eventID` en el navegador, `event_id` en el servidor).
- **Secretos:** el token de CAPI (`META_CAPI_ACCESS_TOKEN`) es un **secreto de servidor**: nunca con prefijo `PUBLIC_`, nunca en el navegador ni en Git. Falta, además, un endpoint de servidor (por ejemplo una función de Vercel) que aún no existe.
- No se envía a Meta contenido de WhatsApp, direcciones de entrega, datos de pago ni datos personales directos sin confirmación expresa y una necesidad concreta. No se envían eventos de prueba hasta tener el código de prueba de Meta.

## Comparar versiones y volver al punto de restauración

| Qué | Dónde |
|---|---|
| **Versión animada aprobada** (portada del camión en 2D, manos y personaje ilustrados) | `/` — intacta |
| **Alternativa realista (prueba, 3D con three.js)** | `/realista` — ruta aparte, `noindex`, fuera del sitemap |
| Botón de comparación | En `/` aparece «Comparar: versión realista (prueba)»; en `/realista`, la barra inferior «Ver la versión animada actual» |

La alternativa vive solo en `src/lab/realista.astro` y `src/scripts/realista/` (más `three` en `package.json` y un enlace en `Base.astro`). Los recursos de la versión animada (`Truck`, `Hands`, `PcHead`, `home.ts`) no se tocaron. Para descartarla: borra esos archivos y `npm uninstall three`. **Solo existe en desarrollo (`npm run dev`): en la compilación de producción no se genera** (para incluirla en un build de prueba: `PUBLIC_ENABLE_REALISTA=1 npm run build`).

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

## UBU Gestión (`/admin`)

Portal interno (solo administradores) con menú lateral: **Dashboard, Punto de venta, Cotizaciones, Facturas y anulaciones, Inventario, Catálogo y precios, Clientes y terceros, Cuentas por cobrar (incluye cobros vencidos) y Gastos**. Fase 2 (en construcción): Garantías, Campañas WhatsApp, Reportes y Estados financieros.

- Código: `src/pages/admin.astro` (estructura y estilos), `src/scripts/gestion/app.ts` (módulos), `src/scripts/gestion/api.ts` (Supabase), `src/scripts/admin.ts` (editor de precios).
- Base de datos: **ejecuta `supabase/gestion.sql`** en el SQL Editor (una vez; es idempotente). Crea terceros, inventario, kardex, documentos, ítems, pagos y gastos con RLS solo-admin, y las funciones `emitir_documento`, `registrar_pago`, `anular_documento` y `ajustar_inventario`: totales, consecutivos (COT-, FV-, REM-) y movimientos de stock se calculan en el servidor en una sola transacción.
- Documentos internos (cotización, factura de venta, remisión): **no son factura electrónica DIAN**. Se descargan como imagen con el diseño UBU y se envían por WhatsApp.
- Dos listas de precios: `gestion.sql` copia los precios actuales de la web a la lista **mayorista** (sin pisar ediciones). La lista **cliente final** se edita en «Catálogo y precios».
- La sesión de administración se renueva sola con el refresh token mientras la pestaña esté abierta.

## Supabase: catálogo, mayoristas y administración

Proyecto: `ksfabuzurjxofapqoonc` (el mismo que usaba el sitio anterior). Sitio estático + Supabase (Auth y RLS); no hay backend propio ni secretos en el código.

**Cómo funciona**
- Público: el HTML trae los precios del catálogo (`products.json`); al cargar, `pricing.ts` oculta los productos inactivos y aplica el precio de cliente final de la tabla `precios` (vacío = precio del catálogo).
- Mayorista: en `/mayoristas` inicia sesión el usuario global; solo entonces se leen `precios_mayoristas` (RLS: solo usuarios de la tabla `mayoristas` o `admins`). Sin precio mayorista se muestra «Consultar precio». Franja «Vista mayorista activa» con «Cerrar sesión».
- Admin: `/admin` (enlace «Administración» al final del menú hamburguesa). Solo usuarios de `admins` pueden leer todo y escribir (RLS). Un mayorista que intente entrar es rechazado y la base de datos bloquea sus escrituras.
- Sesión: token de Supabase en `sessionStorage` (nunca la contraseña); se borra al cerrar la pestaña y caduca con el token (1 h por defecto). Al vencer, vuelve la vista pública.
- Precios: enteros COP >= 0, validados también en la base de datos (`check (precio >= 0)`).
- El panel anterior `public/admin.html` (no funcionaba: sus tablas no existían) se retiró; queda una copia en `legacy-site/admin.html`.

**Configuración (una sola vez, la haces tú)**
1. Supabase → SQL Editor: ejecuta `supabase/schema.sql` y luego `supabase/seed.sql` (no pisa ediciones previas).
2. Authentication → Sign In / Providers: **desactiva «Allow new users to sign up»** (solo tú creas usuarios).
3. Authentication → Users → Add user (con «Auto Confirm»): crea el administrador y el usuario mayorista, con correos y contraseñas fuertes y distintas. No los escribas en el repositorio.
4. SQL Editor (cambia los correos):
   `insert into public.admins (user_id) select id from auth.users where email = 'admin@tu-dominio.com';`
   `insert into public.mayoristas (user_id) select id from auth.users where email = 'mayoristas@tu-dominio.com';`
5. Variables (públicas, no son secretos): `PUBLIC_SUPABASE_URL=https://ksfabuzurjxofapqoonc.supabase.co` y `PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API → anon/publishable). En local van en `.env` (ignorado por Git); en Vercel, en Environment Variables, y requieren volver a compilar. **Nunca** la `service_role`.
6. Cambiar la contraseña mayorista: Authentication → Users → el usuario → actualizar contraseña. Mayoristas individuales en el futuro: crea más usuarios y agrégalos a `mayoristas`; el código no cambia.

**Límites conocidos**
- El sitio es estático: un producto oculto se retira al cargar la página (catálogo, fichas, inicio y carrito; su ficha redirige a la categoría), pero sigue en el HTML compilado y en el sitemap hasta la próxima compilación.
- Los precios de cliente final editados se aplican al cargar; buscadores y JSON-LD siguen viendo los de `products.json`.
- El enlace «Administración» solo está en el menú hamburguesa (pantallas de hasta 1060 px); en escritorio se entra con `/admin`.
- La imagen de cotización y el texto de WhatsApp usan la vista activa (pública o mayorista).

## SEO y dominio

Configurado: `<title>` y descripción por página, canonical, Open Graph/Twitter (`/og.png`), JSON-LD (Organization, WebSite, Product, ItemList, FAQPage), `sitemap-index.xml`, `robots.txt`, `noindex` en admin y lista de cotización, redirecciones de URLs antiguas en `vercel.json` (`/paginas/*`, `/productos/*`, `/legal/*`, `/maquinas`, `/accesorios`) y cabeceras de seguridad.

Depende de ti: apuntar el dominio al proyecto de Vercel (DNS) y dejar `www.ubulatinoamerica.com` como dominio principal con el dominio sin `www` redirigiendo a él (en Vercel → Settings → Domains), enviar el sitemap en Search Console y verificar la propiedad.

## Pendientes legales y de contenido

- Las páginas `privacidad`, `cookies` y `terminos` son **borradores** del sitio anterior, actualizados para reflejar el sitio nuevo (sin Google Fonts ni banner de cookies; el formulario solo abre WhatsApp). Siguen marcados `[Pendiente: …]` (razón social, NIT, correo, fechas, etc.) y necesitan validación legal.
- `public/descargas/catalogo-ubu-2026.pdf` es el PDF público que ya existía (3 MB); no es el archivo de `source-private` (38 MB) y no se encontró «Harman» en su texto, así que probablemente no incluye ese producto. Si quieres actualizarlo, exporta una versión optimizada del PDF fuente y reemplázala.
- La escena de las manos y el personaje con cabeza de computador son ilustraciones originales hechas para este sitio, inspiradas en las referencias; no son fotografías ni una mascota oficial, y el personaje no es un asistente automatizado.
