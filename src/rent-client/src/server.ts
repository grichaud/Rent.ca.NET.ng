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
 */
app.use((req, res, next) => {
  angularApp
    .handle(req, { cookie: req.headers.cookie ?? '' })
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
