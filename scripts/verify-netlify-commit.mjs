// A build hook clones the branch head. Reject it if that is no longer the
// commit that passed GitHub checks. Manual Netlify builds have no hook payload.
const rawBody = process.env.INCOMING_HOOK_BODY;
const isHook = Boolean(rawBody || process.env.INCOMING_HOOK_URL);

if (isHook) {
  let payload;
  try {
    // Netlify documents the payload as URL-encoded; JSON also covers the
    // unencoded value exposed by build environments.
    payload = JSON.parse(rawBody?.trim().startsWith("{") ? rawBody : decodeURIComponent(rawBody ?? ""));
  } catch {
    console.error("El build hook no contiene una solicitud válida.");
    process.exit(1);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof payload.commit !== "string" || !/^[a-f0-9]{40}$/.test(payload.commit) ||
      payload.commit !== process.env.COMMIT_REF) {
    console.error("El commit recibido por Netlify no coincide con la versión comprobada. Se cancela la publicación.");
    process.exit(1);
  }
  console.log("El commit del build hook coincide con la versión comprobada.");
}
