import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

/**
 * Host de la API. El mismo valor que usa el render del servidor para pedirse los datos, y el
 * destino al que este proceso reenvia las llamadas del NAVEGADOR.
 */
const apiBaseUrl = process.env['API_BASE_URL'] ?? 'http://localhost:5282';

/**
 * Hostnames que el motor de Angular acepta (proteccion contra SSRF: rechaza peticiones cuya
 * cabecera Host no reconoce). Sin el dominio real, produccion responde 400 a todo.
 *
 * Va en runtime y no en `angular.json` a proposito: el dominio de despliegue no se sabe en
 * tiempo de build, y fijarlo alli obligaria a recompilar para cambiar de host.
 */
const allowedHosts = [
  'localhost',
  '127.0.0.1',
  ...(process.env['ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
];

const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts });

/**
 * Cabeceras de seguridad. Van ANTES que el proxy y que los estaticos para que las lleve toda
 * respuesta, incluidas las de `/api` y las imagenes.
 *
 * `x-powered-by` se apaga porque anunciar "Express" solo le ahorra trabajo a quien busca
 * versiones vulnerables.
 *
 * La CSP permite explicitamente lo que el sitio usa de verdad: los mapas de Google, las fotos
 * de Unsplash y las fuentes de Google.
 *
 * **`'unsafe-inline'` en `script-src` es una concesion consciente, no un descuido.** Angular
 * emite scripts en linea para la hidratacion, y `withEventReplay()` anade ademas un manejador
 * de eventos en linea — y a los manejadores no les valen ni hash ni nonce (harian falta
 * `'unsafe-hashes'`). Las alternativas eran quitar el event replay, que existe para que un clic
 * hecho durante la hidratacion no se pierda —justo lo que pasa en un SSR que tarda—, o dejar la
 * pagina rota. Se prefiere conservar la funcion y ser explicito aqui.
 *
 * Lo que la CSP SIGUE aportando con esa concesion: nadie puede cargar scripts de un dominio
 * ajeno, ni enmarcar el sitio, ni reescribir `<base>`, ni mandar un formulario a otro host, ni
 * cargar imagenes o abrir conexiones fuera de la lista. Si algun dia se retira el event replay,
 * esto se puede endurecer con nonce.
 */
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // El sitio no pide camara, microfono ni ubicacion. Declararlo cierra la puerta a que lo haga
  // un tercero embebido.
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  // Un ano, y solo sobre HTTPS: enviarlo por HTTP no significa nada y confunde al depurar.
  // Sin `preload`, que es irreversible en la practica y no procede en un subdominio prestado.
  if (req_isSecure(_req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com",
      "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com",
      "frame-src 'self' https://www.google.com",
    ].join('; '),
  );
  next();
});

/** Detras del proxy de Azure la peticion llega por HTTP; el protocolo real viene en la cabecera. */
function req_isSecure(req: express.Request): boolean {
  return req.secure || (req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0] === 'https';
}

/**
 * Reenvio de la API al navegador.
 *
 * Este servidor es la unica puerta publica: el navegador solo conoce SU host, asi que las
 * llamadas de cliente salen como `/api/...` contra el y hay que reenviarlas. Sin esto, cada
 * una cae en el renderer de Angular y vuelve como HTML — login, favoritos, consultas, chat y
 * las fotos, todo muerto en produccion aunque la API este perfectamente viva.
 *
 * Detalles que importan:
 *
 * - **Las cookies no se reescriben.** La API emite `Set-Cookie` SIN atributo Domain, asi que
 *   la cookie queda ligada al host que ve el navegador (este). Tocar el dominio aqui la
 *   dejaria fuera de alcance y la sesion no sobreviviria a la primera navegacion.
 * - **Sin buffering.** El chat responde por Server-Sent Events; acumular la respuesta la
 *   entregaria de golpe al final y se perderia el efecto de escritura progresiva.
 * - **`changeOrigin`**: App Service enruta por la cabecera Host, asi que hay que mandar la
 *   del destino y no la nuestra.
 */
const apiProxy = createProxyMiddleware({
  target: apiBaseUrl,
  changeOrigin: true,
  xfwd: true,
  // Se filtra por ruta en vez de montar en `app.use('/api', ...)`: Express RECORTA el prefijo
  // del punto de montaje, asi que la API recibiria `/home` en lugar de `/api/home` y
  // contestaria 404 a todo. Con `pathFilter` la URL llega intacta.
  //
  // Va como FUNCION y no como lista de globs. Con globs, anadir `/signin-google` a la lista
  // hacia que dejara de reenviarse `/api/**` —comprobado: la home caia en el renderer— y el
  // sintoma no apuntaba a la causa. Una funcion dice exactamente que se reenvia y no depende de
  // como interprete los comodines la libreria.
  //
  // `/signin-google` es la unica ruta de la API que NO cuelga de `/api`: es el CallbackPath por
  // defecto del handler de Google, y quien la abre es el navegador al volver del proveedor. Si
  // Google devolviera directamente al host de la API, esa vuelta ocurriria en un dominio
  // distinto del que emitio la cookie de correlacion —que se guarda en ESTE host, porque el
  // challenge tambien pasa por aqui— y el login moriria con un 500. Reenviarla mantiene todo el
  // viaje en la unica puerta publica, que es lo que ya asume el resto de la topologia.
  pathFilter: (path: string) => {
    const soloRuta = path.split('?')[0];
    return (
      soloRuta.startsWith('/api/') ||
      soloRuta.startsWith('/uploads/') ||
      soloRuta === '/signin-google'
    );
  },
  // El cuerpo se transmite tal cual llega, sin esperar a tenerlo entero.
  selfHandleResponse: false,
  on: {
    proxyRes: (proxyRes) => {
      // Cinturon y tirantes con los proxys intermedios de Azure, que si no acumulan el SSE.
      if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
        proxyRes.headers['x-accel-buffering'] = 'no';
      }
    },
  },
});

// Las fotos de los listings las sirve la API desde su wwwroot/uploads; van por el mismo filtro.
app.use(apiProxy);

/**
 * Origen publico de la peticion, en absoluto.
 *
 * Detras de App Service la conexion que ve este proceso es HTTP y el host es interno: lo que
 * el visitante escribio viaja en `x-forwarded-*`. Escribir el host equivocado en un canonical
 * no rompe nada visible pero manda al buscador a un dominio que no existe.
 */
function originOf(req: express.Request): string {
  const forwarded = (name: string) =>
    (req.headers[name] as string | undefined)?.split(',')[0]?.trim() || undefined;

  const proto = forwarded('x-forwarded-proto') ?? req.protocol ?? 'http';
  const host = forwarded('x-forwarded-host') ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

/** El dominio canonico fijado por configuracion gana sobre el host de la peticion. */
function siteBaseUrl(req: express.Request): string {
  return (process.env['SITE_BASE_URL'] ?? originOf(req)).replace(/\/+$/, '');
}

const LOCALES = ['en', 'fr'] as const;

/**
 * Rutas estaticas que entran al sitemap. `landlords` es la landing comercial publica; el
 * portal privado es `landlord`, en singular, y NO se indexa.
 */
const STATIC_PATHS = ['', '/about', '/faq', '/privacy', '/landlords'];

/**
 * robots.txt.
 *
 * OJO con el prefijo: `Disallow: /en/landlord` bloquearia tambien `/en/landlords`, que es
 * justo la pagina comercial que mas interesa indexar — las reglas de robots.txt casan por
 * prefijo, no por segmento. De ahi la barra final, el ancla `$` y el `Allow` explicito.
 */
app.get('/robots.txt', (req, res) => {
  const lines = ['User-agent: *'];

  for (const locale of LOCALES) {
    lines.push(`Allow: /${locale}/landlords`);
    for (const segment of ['admin', 'landlord', 'renter']) {
      lines.push(`Disallow: /${locale}/${segment}/`, `Disallow: /${locale}/${segment}$`);
    }
    for (const segment of ['login', 'signup', 'forgot-password', 'reset-password', 'external-login-confirm']) {
      lines.push(`Disallow: /${locale}/${segment}`);
    }
  }

  lines.push('', `Sitemap: ${siteBaseUrl(req)}/sitemap.xml`, '');

  res.type('text/plain').send(lines.join('\n'));
});

interface SitemapEntry {
  path: string;
  lastModified: string | null;
}

interface SitemapFeed {
  cities: { slug: string; lastModified: string | null }[];
  listings: { citySlug: string; slug: string; lastModified: string | null }[];
}

/**
 * El sitemap se cachea en memoria.
 *
 * Construirlo obliga a la API a recorrer el catalogo entero, y el plan F1 del despliegue tiene
 * 60 minutos de CPU al dia (PRP 12.3): un rastreador insistente los quemaria el solo. El
 * catalogo cambia en horas, no en segundos, asi que servir una version de hace un rato no
 * pierde nada.
 */
const SITEMAP_TTL_MS = 15 * 60 * 1000;
let sitemapCache: { xml: string; expiresAt: number; baseUrl: string } | null = null;

app.get('/sitemap.xml', async (req, res) => {
  const baseUrl = siteBaseUrl(req);
  const now = Date.now();

  if (sitemapCache && sitemapCache.expiresAt > now && sitemapCache.baseUrl === baseUrl) {
    res.type('application/xml').set('Cache-Control', 'public, max-age=900').send(sitemapCache.xml);
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/sitemap`);
    if (!response.ok) throw new Error(`API responded ${response.status}`);
    const feed = (await response.json()) as SitemapFeed;

    const entries: SitemapEntry[] = [
      ...STATIC_PATHS.map((path) => ({ path, lastModified: null })),
      ...feed.cities.map((c) => ({ path: `/${c.slug}`, lastModified: c.lastModified })),
      ...feed.listings.map((l) => ({
        path: `/${l.citySlug}/${l.slug}`,
        lastModified: l.lastModified,
      })),
    ];

    const xml = renderSitemap(baseUrl, entries);
    sitemapCache = { xml, expiresAt: now + SITEMAP_TTL_MS, baseUrl };
    res.type('application/xml').set('Cache-Control', 'public, max-age=900').send(xml);
  } catch (error) {
    // Un sitemap a medias es peor que ninguno: le diria al buscador que el catalogo encogio.
    // Mejor un 503, que se reintenta, que un 200 mintiendo.
    console.error('sitemap.xml: no se pudo construir', error);
    res.status(503).type('text/plain').send('Sitemap temporarily unavailable');
  }
});

/**
 * Cada URL se emite una vez por idioma, y cada una declara a las demas con `xhtml:link`. Es
 * el equivalente en sitemap de los `hreflang` del `<head>`: sin esta relacion el buscador ve
 * dos sitios distintos que casualmente se parecen.
 */
function renderSitemap(baseUrl: string, entries: SitemapEntry[]): string {
  const urls = entries.flatMap((entry) =>
    LOCALES.map((locale) => {
      const alternates = [
        ...LOCALES.map((alt) => ({ hreflang: alt, href: `${baseUrl}/${alt}${entry.path}` })),
        { hreflang: 'x-default', href: `${baseUrl}/en${entry.path}` },
      ]
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}"/>`)
        .join('\n');

      const lastmod = entry.lastModified
        ? `\n    <lastmod>${escapeXml(entry.lastModified)}</lastmod>`
        : '';

      return `  <url>\n    <loc>${escapeXml(`${baseUrl}/${locale}${entry.path}`)}</loc>${lastmod}\n${alternates}\n  </url>`;
    }),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Cache en memoria del HTML renderizado.
 *
 * En el plan F1 esto no es una optimizacion, es lo que mantiene la app viva (PRP 12.3). Cada
 * visita renderiza en servidor Y pide datos a la API, y hay dos cuotas que se agotan a la vez:
 *
 * - Los **60 minutos de CPU al dia** compartidos por SSR y API. Al superarlos, las dos apps se
 *   paran hasta el dia siguiente.
 * - Los **100.000 vCore-segundos al mes** de la base gratuita. La base se despierta con cada
 *   consulta y el retardo minimo de auto-pausa es de UNA HORA, asi que una sola visita cuesta
 *   una hora de cuota. Si se agotan, la base queda inaccesible hasta el mes siguiente y no hay
 *   forma de revivirla sin habilitar cargos.
 *
 * Sirviendo desde aqui no se renderiza ni se llama a la API, asi que la base se queda dormida.
 *
 * Lo que NO se cachea, y por que:
 *
 * - **Peticiones con sesion.** El HTML lleva el nombre del usuario en la cabecera y su estado
 *   de favoritos en cada tarjeta. Compartir esa pagina seria servirle la sesion de una persona
 *   a otra: no es un fallo de rendimiento, es una fuga de datos.
 * - **Las zonas privadas**, aunque llegaran sin cookie: lo unico que devuelven es un 302 al
 *   login, que no merece guardarse.
 * - **Cualquier cosa que no sea un GET con 200.**
 *
 * Y la clave incluye el TEMA, porque el servidor pinta claro u oscuro segun la cookie del
 * visitante; sin eso, quien pidiera claro recibiria la pagina oscura de otro.
 */
const CACHE_TTL_MS = Number(process.env['SSR_CACHE_TTL_SECONDS'] ?? 300) * 1000;
const CACHE_MAX_ENTRIES = Number(process.env['SSR_CACHE_MAX_ENTRIES'] ?? 200);

/** Cookie de sesion de ASP.NET Identity: su presencia significa "esta pagina es personal". */
const SESSION_COOKIE = '.AspNetCore.Identity.Application';

interface CachedRender {
  body: string;
  headers: Record<string, string>;
  expiresAt: number;
}

const renderCache = new Map<string, CachedRender>();

function cacheKeyFor(req: express.Request): string | null {
  if (CACHE_TTL_MS <= 0) return null;
  if (req.method !== 'GET') return null;
  if ((req.headers.cookie ?? '').includes(SESSION_COOKIE)) return null;

  const path = req.path;
  const segments = path.split('/').filter(Boolean);
  if (PRIVATE_SEGMENTS.has(segments[1] ?? '')) return null;

  // El tema entra en la clave; el resto de cookies no influye en el HTML de una pagina publica.
  const theme = (req.headers.cookie ?? '').includes('rentca-theme=light') ? 'light' : 'dark';

  // Y el ORIGEN tambien, por dos motivos independientes:
  //
  // 1. **Seguridad.** Angular rechaza con 400 las peticiones cuya cabecera Host no reconoce
  //    (proteccion contra SSRF). Esa comprobacion vive dentro del render, asi que servir desde
  //    la cache antes de llamarlo la SALTABA por completo: bastaba con que alguien hubiera
  //    pedido la misma ruta antes para que un host ajeno recibiera 200. Metiendo el origen en
  //    la clave, un host desconocido nunca acierta una entrada y acaba siempre en el render,
  //    que lo rechaza.
  // 2. **Correccion.** El `<head>` que produce la Fase 12 lleva el canonical, los `hreflang` y
  //    `og:url` construidos con el origen de la peticion. Compartir una entrada entre hosts
  //    serviria el dominio equivocado dentro del HTML.
  return `${originOf(req)}|${theme}|${req.originalUrl}`;
}

function rememberRender(key: string, body: string, headers: Record<string, string>): void {
  // Poda por antiguedad de insercion: los Map de JavaScript conservan el orden, asi que la
  // primera clave es la mas vieja. Con un catalogo de decenas de ciudades el tope no se roza,
  // pero un rastreador pidiendo URLs inventadas llenaria la memoria de un F1 sin esto.
  if (renderCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, { body, headers, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Primeros segmentos (tras el idioma) que nunca se cachean. Ojo: `landlord` es el portal
 * privado y `landlords` la landing publica — la comparacion es por segmento exacto.
 */
const PRIVATE_SEGMENTS = new Set([
  'login', 'signup', 'forgot-password', 'reset-password', 'external-login-confirm',
  'renter', 'landlord', 'admin',
]);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
/**
 * El contexto de la peticion se pasa explicitamente al render.
 *
 * El token REQUEST llega al render, pero su cabecera `cookie` viene vacia, asi que el
 * servidor no podria saber que tema pidio el usuario y serviria siempre el oscuro. Pasar
 * la cookie por `requestContext` (que se lee con REQUEST_CONTEXT) no depende de que
 * Angular decida propagar cabeceras.
 *
 * Por el mismo camino viaja el ORIGEN publico, que el `<head>` necesita para escribir
 * `canonical`, los `hreflang` y `og:url` en absoluto. Se deriva de las cabeceras porque el
 * dominio no se sabe en tiempo de build; `SITE_BASE_URL` lo sobreescribe cuando hace falta
 * fijar un dominio canonico unico.
 */
app.use((req, res, next) => {
  const key = cacheKeyFor(req);

  if (key) {
    const hit = renderCache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.status(200);
      for (const [name, value] of Object.entries(hit.headers)) res.setHeader(name, value);
      res.setHeader('x-ssr-cache', 'hit');
      res.end(hit.body);
      return;
    }
    if (hit) renderCache.delete(key);
  }

  angularApp
    .handle(req, { cookie: req.headers.cookie ?? '', origin: originOf(req) })
    .then(async (response) => {
      if (!response) return next();
      if (!key || response.status !== 200) {
        return writeResponseToNodeResponse(response, res);
      }

      // Para poder guardarlo hay que leer el cuerpo entero, asi que la respuesta se escribe a
      // mano en vez de con writeResponseToNodeResponse: ese consume el stream y no lo devuelve.
      const body = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        // Set-Cookie NO se guarda jamas: seria repartir la cookie de un visitante entre todos
        // los que reciban esta entrada de cache.
        if (name.toLowerCase() !== 'set-cookie') headers[name] = value;
      });

      rememberRender(key, body, headers);

      res.status(200);
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      res.setHeader('x-ssr-cache', 'miss');
      res.end(body);
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
    console.log(`Proxying /api and /uploads to ${apiBaseUrl}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
