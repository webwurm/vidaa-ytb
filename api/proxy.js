import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const SMART_TV_USER_AGENT =
  'Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.31 SmartTV/10.0';

const YT_ORIGIN = 'https://www.youtube.com';
const YT_TV_URL = 'https://www.youtube.com/tv';

const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.py': 'text/x-python; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.bat': 'application/x-msdos-program'
};

/**
 * Script injecté en tête de <head> dans la réponse HTML de YouTube TV (/tv)
 * - Active l'environnement Hisense VIDAA OS (1920x1080, classe vidaa-tv, Hisense API)
 * - Spoof le User-Agent SmartTV côté client pour kabuki
 * - Redirige automatiquement les appels fetch / XHR vers le proxy pour éviter tout blocage CORS
 */
function buildClientBootstrapScript(nonceAttr) {
  return `<meta id="app-viewport" name="viewport" content="width=1920, height=1080, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="manifest" href="/manifest.json" />
<style${nonceAttr}>yt-debug-watermark, [idomkey="lazy-debug-watermark"] { display: none !important; }</style>
<script${nonceAttr}>
(function bootstrapYoutubeVidaa() {
  window.__ORIGINAL_USER_AGENT__ = navigator.userAgent || "";
  window.__NUVIO_PLATFORM__ = "vidaa";
  window.__YOUTUBE_PLATFORM__ = "vidaa";
  document.documentElement.classList.add("vidaa-tv");

  if (typeof window.Hisense_AddInsecureDomain === "function") {
    try { window.Hisense_AddInsecureDomain("*"); } catch (e) {}
  }

  var smartTvUA = ${JSON.stringify(SMART_TV_USER_AGENT)};
  try {
    Object.defineProperty(navigator, "userAgent", {
      get: function () { return smartTvUA; },
      configurable: true
    });
  } catch (e) {}

  try {
    var recKey = "yt.leanback.default::recurring_actions";
    var now = Date.now();
    var future = now + 7 * 24 * 60 * 60 * 1000;
    var rawRec = localStorage.getItem(recKey);
    var recObj = rawRec ? JSON.parse(rawRec) : { data: { data: {}, idData: {}, lastPruned: now }, e: now + 365 * 24 * 60 * 60 * 1000 };
    if (!recObj.data) recObj.data = { data: {}, idData: {}, lastPruned: now };
    if (!recObj.data.data) recObj.data.data = {};
    var actions = ["startup-screen-account-selector-with-guest", "whos_watching_fullscreen_zero_accounts", "startup-screen-signed-out-welcome-back"];
    for (var i = 0; i < actions.length; i++) {
      var k = actions[i];
      recObj.data.data[k] = { timesFired: 1, earliestKnownTime: now, lastFired: future, dailiesBitSet: 1, dailiesTimestamp: now };
    }
    localStorage.setItem(recKey, JSON.stringify(recObj));
    if (!localStorage.getItem("yt.leanback.default::last-identity-used") && !localStorage.getItem("yt.leanback.default::AUTONAV_FOR_LIVING_ROOM")) {
      localStorage.setItem("yt.leanback.default::AUTONAV_FOR_LIVING_ROOM", JSON.stringify({ data: { guest: true } }));
    }
  } catch (e) {}

  if (!window.location.hash || window.location.hash === "#") {
    try {
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          window.location.search +
          "#/?env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1"
      );
    } catch (e) {
      window.location.hash = "#/?env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1";
    }
  }

  var CORS_PROXY_HOSTS = {
    "www.gstatic.com": true,
    "gstatic.com": true,
    "yt3.ggpht.com": true,
    "yt3.googleusercontent.com": true,
    "i.ytimg.com": true,
    "i9.ytimg.com": true,
    "clients1.google.com": true,
    "play.google.com": true,
    "youtubei.googleapis.com": true,
    "redirector.googlevideo.com": true
  };

  var SAME_ORIGIN_YT_HOSTS = {
    "www.youtube.com": true,
    "youtube.com": true,
    "m.youtube.com": true
  };

  function shouldProxyCorsHost(hostname) {
    if (!hostname) return false;
    if (CORS_PROXY_HOSTS[hostname]) return true;
    if (
      hostname.endsWith(".googlevideo.com") ||
      hostname.endsWith(".c.youtube.com") ||
      hostname.endsWith(".gstatic.com") ||
      hostname.endsWith(".ggpht.com") ||
      hostname.endsWith(".googleusercontent.com") ||
      hostname.endsWith(".ytimg.com")
    ) {
      return true;
    }
    return false;
  }

  function rewriteRequestUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
    if (rawUrl.indexOf("/cors-bypass/") === 0 || rawUrl.indexOf("data:") === 0 || rawUrl.indexOf("blob:") === 0) {
      return rawUrl;
    }
    if (
      rawUrl.indexOf("/eligibility_check") !== -1 ||
      rawUrl.indexOf("panelresearch.googlevideo.com") !== -1 ||
      rawUrl.indexOf("doubleclick.net") !== -1
    ) {
      return "data:application/json,{}";
    }
    var normalized = rawUrl.indexOf("//") === 0 ? window.location.protocol + rawUrl : rawUrl;
    if (normalized.indexOf("http://") !== 0 && normalized.indexOf("https://") !== 0) {
      return rawUrl;
    }
    try {
      var parsed = new URL(normalized);
      if (parsed.origin === window.location.origin) {
        return rawUrl;
      }
      if (parsed.host === window.location.host || SAME_ORIGIN_YT_HOSTS[parsed.hostname]) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
      if (shouldProxyCorsHost(parsed.hostname)) {
        return "/cors-bypass/" + encodeURIComponent(parsed.toString());
      }
    } catch (e) {}
    return rawUrl;
  }

  window.__rewriteYoutubeVidaaUrl = rewriteRequestUrl;

  try {
    function bustCssLink(el) {
      if (!el || el.tagName !== "LINK") return;
      var h = el.getAttribute("href");
      if (h && h.indexOf("/s/_/kabuki/_/ss/") !== -1 && h.indexOf("_cb=") === -1) {
        el.setAttribute("href", h + (h.indexOf("?") === -1 ? "?" : "&") + "_cb=vidaa2");
      }
    }
    if (typeof MutationObserver !== "undefined") {
      var cssObs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            bustCssLink(added[j]);
          }
        }
      });
      cssObs.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {}

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try {
        if (typeof url === "string") {
          url = rewriteRequestUrl(url);
        }
      } catch (e) {}
      return origBeacon(url, data);
    };
  }

  if (typeof window.Request === "function") {
    var OrigRequest = window.Request;
    var PatchedRequest = function (input, init) {
      try {
        if (typeof input === "string") {
          input = rewriteRequestUrl(input);
        } else if (input && typeof URL !== "undefined" && input instanceof URL) {
          input = rewriteRequestUrl(input.toString());
        }
      } catch (e) {}
      if (arguments.length > 1) {
        return new OrigRequest(input, init);
      }
      return new OrigRequest(input);
    };
    PatchedRequest.prototype = OrigRequest.prototype;
    window.Request = PatchedRequest;
  }

  if (typeof window.fetch === "function") {
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string") {
          input = rewriteRequestUrl(input);
        } else if (input && typeof URL !== "undefined" && input instanceof URL) {
          input = rewriteRequestUrl(input.toString());
        } else if (typeof OrigRequest !== "undefined" && input instanceof OrigRequest) {
          var rewritten = rewriteRequestUrl(input.url);
          if (rewritten !== input.url) {
            return input.arrayBuffer().then(function (buf) {
              return origFetch(rewritten, {
                method: input.method,
                headers: input.headers,
                body: input.method !== "GET" && input.method !== "HEAD" && buf.byteLength ? buf : undefined,
                credentials: input.credentials,
                mode: input.mode,
                cache: input.cache,
                redirect: input.redirect,
                referrer: input.referrer,
                signal: (init && init.signal) || input.signal
              });
            });
          }
        }
      } catch (e) {}
      return origFetch(input, init);
    };
  }

  if (typeof window.XMLHttpRequest !== "undefined") {
    var origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (typeof url === "string") {
          arguments[1] = rewriteRequestUrl(url);
        } else if (url && typeof url.toString === "function") {
          arguments[1] = rewriteRequestUrl(url.toString());
        }
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };
  }
})();
</script>`;
}

/**
 * Tente de servir un fichier statique local depuis dist/vidaa ou dist
 */
function tryServeStaticFile(pathname, res) {
  const cleanPath = pathname.split('?')[0];
  const candidateDirs = [
    path.join(ROOT_DIR, 'dist', 'vidaa'),
    path.join(ROOT_DIR, 'dist')
  ];

  for (const baseDir of candidateDirs) {
    const resolved = path.resolve(baseDir, '.' + cleanPath);
    if (!resolved.startsWith(baseDir)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      const mime = STATIC_MIME_TYPES[ext] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.end(fs.readFileSync(resolved));
      return true;
    }
  }
  return false;
}

/**
 * Désactive le bodyParser automatique de Vercel pour préserver les corps binaires (SABR/protobuf) et form-urlencoded
 */
export const config = {
  api: {
    bodyParser: false
  }
};

/**
 * Lit le corps brut de la requête entrante
 */
async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return undefined;
  }
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (req.body instanceof Uint8Array) return Buffer.from(req.body);
    if (typeof req.body === 'string') return Buffer.from(req.body);
    if (typeof req.body === 'object') {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        return Buffer.from(new URLSearchParams(req.body).toString());
      }
      return Buffer.from(JSON.stringify(req.body));
    }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

/**
 * Hôtes autorisés pour /cors-bypass/ (miroir de shouldProxyCorsHost côté client).
 * Sans cette liste, le proxy relaierait n'importe quelle URL (proxy ouvert).
 */
const CORS_BYPASS_HOSTS = new Set([
  'www.gstatic.com',
  'gstatic.com',
  'fonts.gstatic.com',
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
  'i.ytimg.com',
  'i9.ytimg.com',
  'clients1.google.com',
  'play.google.com',
  'youtubei.googleapis.com',
  'redirector.googlevideo.com'
]);
const CORS_BYPASS_HOST_SUFFIXES = [
  '.googlevideo.com',
  '.c.youtube.com',
  '.gstatic.com',
  '.ggpht.com',
  '.googleusercontent.com',
  '.ytimg.com'
];

export function isAllowedCorsBypassUrl(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  return (
    CORS_BYPASS_HOSTS.has(host) || CORS_BYPASS_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * Résout l'URL cible vers YouTube ou via /cors-bypass/
 */
function resolveUpstreamUrl(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const pathname = parsed.pathname;

  // 1. Route /cors-bypass/<encoded_url>
  if (pathname.startsWith('/cors-bypass/')) {
    let rawTarget = pathname.slice('/cors-bypass/'.length);
    try {
      rawTarget = decodeURIComponent(rawTarget);
    } catch {
      // Ignore decode error
    }
    // Correction si le serveur a fusionné https:// en https:/
    rawTarget = rawTarget.replace(/^(https?):\/([^/])/, '$1://$2');
    if (parsed.search) {
      rawTarget += (rawTarget.includes('?') ? '&' : '?') + parsed.search.slice(1);
    }
    const targetUrl = new URL(rawTarget);
    if (!isAllowedCorsBypassUrl(targetUrl)) {
      throw new Error(`host not allowed: ${targetUrl.hostname}`);
    }
    return { targetUrl, isTvHtmlEntry: false };
  }

  // 2. Point d'entrée YouTube TV (/tv)
  if (pathname === '/tv' || pathname === '/tv/') {
    const targetUrl = new URL(YT_TV_URL);
    parsed.searchParams.forEach((val, key) => {
      if (key !== 'platform' && key !== 'wrapper' && key !== 'path') {
        targetUrl.searchParams.append(key, val);
      }
    });
    return { targetUrl, isTvHtmlEntry: true };
  }

  // 3. Autocomplete Google (/complete/search)
  if (pathname.startsWith('/complete/')) {
    const targetUrl = new URL(pathname + parsed.search, 'https://clients1.google.com');
    return { targetUrl, isTvHtmlEntry: false };
  }

  // 4. Toutes les autres routes YouTube (/youtubei/*, /s/*, /api/*, etc.)
  const targetUrl = new URL(pathname + parsed.search, YT_ORIGIN);
  if (pathname.startsWith('/s/')) {
    targetUrl.searchParams.delete('_cb');
  }
  return { targetUrl, isTvHtmlEntry: false };
}

/**
 * Handler principal compatible Vercel Serverless Function et serveur HTTP Node.js
 */
export default async function handleProxyRequest(req, res) {
  const reqOrigin = req.headers.origin || '*';
  if (process.env.APP_VERSION) {
    res.setHeader('X-Vidaa-Ytb-Version', process.env.APP_VERSION);
  }

  // Gestion CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Alt-Svc', 'clear');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || '*'
    );
    res.end();
    return;
  }

  const reqUrl = req.url || '/';
  const pathname = reqUrl.split('?')[0];

  // Servir les fichiers statiques locaux (vidaa.html, index.html, userScript.js, manifest.json, sw.js, icon.png, etc.)
  if (
    pathname === '/vidaa.html' ||
    pathname === '/index.html' ||
    pathname.startsWith('/webOSUserScripts/') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/icon.png' ||
    pathname === '/largeIcon.png' ||
    pathname === '/index.js' ||
    pathname.startsWith('/installer/')
  ) {
    const targetStatic = pathname === '/installer/' ? '/installer/index.html' : pathname;
    if (tryServeStaticFile(targetStatic, res)) {
      return;
    }
  }

  // Si on appelle / ou /vidaa.html sans fichier statique, servir directement l'entrée YouTube TV (/tv)
  if (pathname === '/' || pathname === '/vidaa.html' || pathname === '/index.html') {
    req.url = '/tv' + (reqUrl.includes('?') ? '?' + reqUrl.split('?')[1] : '');
  }

  let targetInfo;
  try {
    targetInfo = resolveUpstreamUrl(req.url);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Invalid proxy target URL: ${err.message}`);
    return;
  }

  const { targetUrl, isTvHtmlEntry } = targetInfo;

  // Construction des en-têtes upstream
  const upstreamHeaders = new Headers();
  const skipReqHeaders = new Set([
    'host',
    'connection',
    'content-length',
    'accept-encoding',
    'origin',
    'referer',
    'user-agent',
    'cookie'
  ]);

  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      skipReqHeaders.has(lower) ||
      lower.startsWith('x-vercel-') ||
      lower.startsWith('x-forwarded-') ||
      lower.startsWith('sec-fetch-')
    ) {
      continue;
    }
    if (value !== undefined) {
      upstreamHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  upstreamHeaders.set('User-Agent', SMART_TV_USER_AGENT);
  upstreamHeaders.set('Origin', YT_ORIGIN);
  upstreamHeaders.set('Referer', YT_TV_URL);
  if (upstreamHeaders.has('x-origin')) {
    upstreamHeaders.set('x-origin', YT_ORIGIN);
  }

  if (req.headers.cookie) {
    const translatedCookie = req.headers.cookie
      .replace(/__LocalSecure-/g, '__Secure-')
      .replace(/__LocalHost-/g, '__Host-');
    upstreamHeaders.set('Cookie', translatedCookie);
  }

  try {
    let body = await readRequestBody(req);

    // Normalisation du payload /youtubei/v1/player et /youtubei/v1/next pour éviter CONTENT_CHECK_REQUIRED ("demandée en dehors de l'application YouTube")
    if (
      body &&
      req.method === 'POST' &&
      (pathname.startsWith('/youtubei/v1/player') || pathname.startsWith('/youtubei/v1/next'))
    ) {
      try {
        const json = JSON.parse(body.toString('utf8'));
        json.contentCheckOk = true;
        json.racyCheckOk = true;
        if (json.playbackContext && json.playbackContext.contentPlaybackContext) {
          json.playbackContext.contentPlaybackContext.referer = YT_TV_URL;
          delete json.playbackContext.contentPlaybackContext.isLivingRoomDeeplink;
        }
        if (json.context && json.context.client) {
          json.context.client.originalUrl = YT_TV_URL;
        }
        body = Buffer.from(JSON.stringify(json), 'utf8');
      } catch {
        // Ignorer si le corps n'est pas du JSON valide
      }
    }

    const isCorsBypass = pathname.startsWith('/cors-bypass/');
    const upstreamRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      body,
      redirect: isCorsBypass ? 'follow' : 'manual'
    });

    // Une redirection suivie ne doit pas sortir de la liste des hôtes autorisés
    if (isCorsBypass && upstreamRes.url && !isAllowedCorsBypassUrl(new URL(upstreamRes.url))) {
      await upstreamRes.body?.cancel();
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Redirect target not allowed');
      return;
    }

    // Gestion des redirections upstream
    if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
      const location = upstreamRes.headers.get('location');
      if (location) {
        try {
          const locUrl = new URL(location, targetUrl);
          if (locUrl.hostname === 'www.youtube.com' || locUrl.hostname === 'youtube.com') {
            res.statusCode = upstreamRes.status;
            res.setHeader('Location', locUrl.pathname + locUrl.search + locUrl.hash);
            res.end();
            return;
          }
        } catch {
          // Ignore
        }
      }
    }

    res.statusCode = upstreamRes.status;

    // Filtrage et réécriture des en-têtes de réponse
    const stripResHeaders = new Set([
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'content-security-policy',
      'content-security-policy-report-only',
      'x-frame-options',
      'strict-transport-security',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'set-cookie',
      'alt-svc',
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-methods',
      'access-control-allow-headers'
    ]);

    upstreamRes.headers.forEach((value, key) => {
      if (!stripResHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Réécriture des cookies Set-Cookie pour qu'ils fonctionnent sur le domaine du proxy
    const setCookies =
      typeof upstreamRes.headers.getSetCookie === 'function'
        ? upstreamRes.headers.getSetCookie()
        : upstreamRes.headers.get('set-cookie')
          ? [upstreamRes.headers.get('set-cookie')]
          : [];

    if (setCookies.length > 0) {
      const isHttps =
        req.headers['x-forwarded-proto'] === 'https' ||
        (req.socket && req.socket.encrypted);

      const rewrittenCookies = setCookies.map((cookie) => {
        let c = cookie
          .replace(/;\s*Domain=[^;]+/gi, '')
          .replace(/;\s*Path=\/tv/gi, '; Path=/')
          .replace(/__Secure-/g, '__LocalSecure-')
          .replace(/__Host-/g, '__LocalHost-');
        if (!isHttps) {
          c = c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
        }
        return c;
      });
      res.setHeader('Set-Cookie', rewrittenCookies);
    }

    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Alt-Svc', 'clear');

    const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();

    // 1. Transformation du HTML de YouTube TV (/tv uniquement)
    if (isTvHtmlEntry) {
      let html = await upstreamRes.text();
      // Cache-buster sur la feuille de style CSS principale pour invalider tout ancien cache CDN/navigateur
      html = html.replace(
        /href="(\/s\/_\/kabuki\/_\/ss\/[^"?]+)"/g,
        'href="$1?_cb=vidaa2"'
      );

      const nonceMatch = html.match(/<script[^>]+nonce="([^"]+)"/i);
      const nonceAttr = nonceMatch ? ` nonce="${nonceMatch[1]}"` : '';

      const bootstrapMarkup = buildClientBootstrapScript(nonceAttr);
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${bootstrapMarkup}`);
      } else {
        html = bootstrapMarkup + html;
      }

      const userScriptTag = `<script src="/webOSUserScripts/userScript.js"${nonceAttr}></script>`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${userScriptTag}</body>`);
      } else {
        html += userScriptTag;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.end(html);
      return;
    }

    // 2. Transformation des feuilles de style CSS (/s/_/kabuki/_/ss/) pour que les polices/icônes passent par /cors-bypass/
    if (contentType.includes('text/css') || targetUrl.pathname.includes('/s/_/kabuki/_/ss/')) {
      let css = await upstreamRes.text();
      css = css
        .replace(/url\((['"]?)\/\/www\.gstatic\.com\//g, 'url($1/cors-bypass/https://www.gstatic.com/')
        .replace(/url\((['"]?)https:\/\/www\.gstatic\.com\//g, 'url($1/cors-bypass/https://www.gstatic.com/')
        .replace(/url\((['"]?)\/\/fonts\.gstatic\.com\//g, 'url($1/cors-bypass/https://fonts.gstatic.com/')
        .replace(/url\((['"]?)https:\/\/fonts\.gstatic\.com\//g, 'url($1/cors-bypass/https://fonts.gstatic.com/');
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.end(css);
      return;
    }

    // 3. Transformation des bundles JS de YouTube TV (kabuki base.js uniquement, jamais le CSS /ss/)
    if (
      targetUrl.pathname.includes('/s/_/kabuki/_/js/') &&
      !contentType.includes('text/css')
    ) {
      let js = await upstreamRes.text();
      js = js
        .replace(
          'String(_.cb.location.href)',
          JSON.stringify(YT_TV_URL)
        )
        .replace(
          'b["X-Origin"]=window.location.origin',
          `b["X-Origin"]=${JSON.stringify(YT_ORIGIN)}`
        )
        .replace(
          'document.location.toString()',
          JSON.stringify(YT_TV_URL)
        );
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(js);
      return;
    }

    // 4. Réponse binaire ou JSON brute (streaming direct pour videoplayback/SABR afin d'éviter la latence et la limite mémoire Vercel lors d'un skip SponsorBlock)
    const upstreamContentLength = upstreamRes.headers.get('content-length');
    const upstreamContentEncoding = upstreamRes.headers.get('content-encoding');
    if (
      upstreamRes.body &&
      typeof upstreamRes.body.getReader === 'function' &&
      (targetUrl.pathname.includes('/videoplayback') ||
        targetUrl.pathname.includes('/initplayback') ||
        contentType.includes('vnd.yt-ump') ||
        contentType.startsWith('video/') ||
        contentType.startsWith('audio/'))
    ) {
      if (upstreamContentLength && !upstreamContentEncoding) {
        res.setHeader('Content-Length', upstreamContentLength);
      }
      // req.destroyed ne convient pas : sous Node, une requête POST est détruite dès que son
      // corps a été lu, ce qui coupait le flux SABR à 0 octet. On suit la fermeture de la réponse.
      let clientGone = false;
      res.once('close', () => {
        clientGone = true;
      });
      const reader = upstreamRes.body.getReader();
      try {
        while (true) {
          if (clientGone || res.writableEnded) {
            await reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0 && !res.write(Buffer.from(value)) && !clientGone) {
            await new Promise((resolve) => {
              const done = () => {
                res.off('drain', done);
                res.off('close', done);
                resolve();
              };
              res.on('drain', done);
              res.on('close', done);
            });
          }
        }
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    console.error('[VIDAA Proxy Error]', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
}
