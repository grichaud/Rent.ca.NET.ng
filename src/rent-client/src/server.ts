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
  pathFilter: ['/api/**', '/uploads/**'],
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
  angularApp
    .handle(req, { cookie: req.headers.cookie ?? '', origin: originOf(req) })
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
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
