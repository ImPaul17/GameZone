/** The old Pages site may only send visitors to the reviewed production origin. */
export const pagesBridgeOrigin = "https://gamezone-impaul17.netlify.app";
export const pagesBridgePrefix = "/GameZone";

export function validatePagesBridgeOrigin(value: string): string {
  if (value !== pagesBridgeOrigin) throw new Error("El destino del puente debe ser la URL de producción de GameZone.");
  return value;
}

export function pagesBridgeDestination(pathname: string, search = "", hash = "", targetOrigin = pagesBridgeOrigin): string {
  const destination = new URL(validatePagesBridgeOrigin(targetOrigin));
  const path = pathname === pagesBridgePrefix ? "/" : pathname.startsWith(`${pagesBridgePrefix}/`) ? pathname.slice(pagesBridgePrefix.length) : pathname;
  // Assigning pathname, rather than resolving a URL, keeps //host and backslashes on our origin.
  destination.pathname = path.startsWith("/") ? path : `/${path}`;
  destination.search = search;
  destination.hash = hash;
  return destination.href;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const scriptJson = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderPagesBridge(pathname: string, targetOrigin = pagesBridgeOrigin, unknownRoute = false): string {
  const target = validatePagesBridgeOrigin(targetOrigin);
  const fallback = pagesBridgeDestination(pathname, "", "", target);
  // A 404 cannot know its requested path until the browser runs the script. Its fallback is home.
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>GameZone — Nueva dirección</title>
${unknownRoute ? "" : `<link rel="canonical" href="${escapeHtml(fallback)}">\n<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(fallback)}"></noscript>`}
<style>
@font-face{font-family:SnesItalic;src:url('/GameZone/fonts/SnesItalic.ttf') format('truetype');font-display:swap}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fff;font-family:Inter,Arial,sans-serif;padding:24px}
main{width:min(100%,620px);padding:40px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;text-align:center}
h1{margin:0 0 20px;font:clamp(40px,9vw,64px) SnesItalic,Inter,Arial,sans-serif;color:#6eb92b}p{line-height:1.7;color:#b3b3b3}
a{display:inline-block;margin-top:16px;padding:14px 24px;border-radius:8px;background:#6eb92b;color:#0a0a0a;font-weight:700;text-decoration:none}a:hover{background:#7fca3c}a:focus-visible{outline:3px solid white;outline-offset:5px}
</style>
</head>
<body>
<main><h1>GameZone</h1><p>GameZone tiene una nueva dirección. Te estamos llevando a la misma página.</p><a id="continue" href="${escapeHtml(fallback)}">Continuar en GameZone</a><noscript><p>Si no avanzas automáticamente, utiliza el enlace para continuar.</p></noscript></main>
<script>
(()=>{const target=new URL(${scriptJson(target)});const prefix=${scriptJson(pagesBridgePrefix)};const current=window.location;const path=current.pathname===prefix?'/':current.pathname.startsWith(prefix+'/')?current.pathname.slice(prefix.length):current.pathname;target.pathname=path.startsWith('/')?path:'/'+path;target.search=current.search;target.hash=current.hash;document.getElementById('continue').href=target.href;window.location.replace(target.href)})();
</script>
</body>
</html>
`;
}
