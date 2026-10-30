"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Gamepad2, House, ImagePlus, LoaderCircle, LogOut, Menu, Newspaper, RefreshCw, Save, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type { MemberProfile } from "@/modules/accounts/profile-types";
import styles from "./account.module.css";

type AccountNotice = { text: string; error?: boolean };
class AccountRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function accountRequest<T>(path: string, method: string, body?: Record<string, string> | FormData): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body && !multipart ? { "Content-Type": "application/json" } : undefined,
    body: multipart ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AccountRequestError(data.error || "No se ha podido completar la operación. Vuelve a intentarlo.", response.status);
  return data as T;
}

function ProfileAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.avatar}>
    {url && !failed ? <img src={url} alt={`Foto de perfil de ${name}`} width={160} height={160} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <UserRound size={68} aria-label="Sin foto de perfil" />}
  </div>;
}

export function AccountClient({ initialProfile, discordAvailable, loginError, loadError = false }: {
  initialProfile: MemberProfile | null;
  discordAvailable: boolean;
  loginError?: "expired" | "unavailable";
  loadError?: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(initialProfile?.displayName || "");
  const [bio, setBio] = useState(initialProfile?.bio || "");
  const [profileLoadError, setProfileLoadError] = useState(loadError);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [busy, setBusy] = useState("");
  const [openMenu, setOpenMenu] = useState(false);
  const [notice, setNotice] = useState<AccountNotice | null>(() => loginError ? {
    error: true,
    text: loginError === "expired" ? "El acceso con Discord ha caducado o no es válido. Vuelve a intentarlo." : "No se ha podido completar el acceso con Discord. Inténtalo de nuevo más tarde.",
  } : loadError ? { error: true, text: "No se ha podido cargar tu perfil. Puedes volver a intentarlo." } : null);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationAllowed = useRef(false);
  const dirty = Boolean(profile && (displayName !== profile.displayName || bio !== profile.bio));
  const controlsDisabled = Boolean(busy) || sessionExpired;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !navigationAllowed.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!openMenu) return;
    navigation.current?.querySelector("a")?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpenMenu(false); menuButton.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !navigation.current?.contains(event.target) && !menuButton.current?.contains(event.target)) setOpenMenu(false); };
    const resized = () => { if (window.innerWidth > 768) setOpenMenu(false); };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resized);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resized); };
  }, [openMenu]);

  function reportError(error: unknown) {
    if (error instanceof AccountRequestError && error.status === 401) {
      setSessionExpired(true);
      setProfileLoadError(false);
      setNotice({ error: true, text: "Tu sesión ha caducado. Accede de nuevo con Discord para continuar. Los cambios de este formulario siguen aquí." });
    } else {
      setNotice({ error: true, text: error instanceof TypeError ? "No se ha podido conectar. Comprueba tu conexión y vuelve a intentarlo." : error instanceof Error ? error.message : "No se ha podido completar la operación." });
    }
  }
  async function reloadProfile() {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres cargar el perfil guardado y descartarlos?")) return;
    setBusy("reload"); setNotice(null);
    try {
      const result = await accountRequest<{ profile: MemberProfile }>("/api/account/profile", "GET");
      setProfile(result.profile); setDisplayName(result.profile.displayName); setBio(result.profile.bio);
      setProfileLoadError(false); setSessionExpired(false);
    } catch (error) { reportError(error); }
    finally { setBusy(""); }
  }
  async function startDiscord() {
    if (!discordAvailable || busy) return;
    if (dirty && !window.confirm("Para acceder con Discord saldrás de esta página y se descartarán los cambios sin guardar. ¿Quieres continuar?")) return;
    setBusy("discord"); setNotice(null);
    try {
      const { url } = await accountRequest<{ url: string }>("/api/account/discord", "POST", {});
      let destination: URL;
      try { destination = new URL(url); } catch { throw new Error("No se ha podido iniciar el acceso con Discord."); }
      if (destination.protocol !== "https:" || destination.username || destination.password) throw new Error("No se ha podido iniciar el acceso con Discord.");
      navigationAllowed.current = true;
      window.location.assign(destination);
    } catch (error) { navigationAllowed.current = false; reportError(error); setBusy(""); }
  }
  async function logout() {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres cerrar sesión y descartarlos?")) return;
    setBusy("logout"); setNotice(null);
    try {
      await accountRequest("/api/account/session", "DELETE");
      setProfile(null); setDisplayName(""); setBio(""); setProfileLoadError(false); setSessionExpired(false);
      setNotice({ text: "Has cerrado la sesión de este navegador." }); router.refresh();
    } catch (error) { reportError(error); }
    finally { setBusy(""); }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy("save"); setNotice(null);
    try {
      const result = await accountRequest<{ profile: MemberProfile }>("/api/account/profile", "PATCH", { displayName, bio });
      setProfile(result.profile); setDisplayName(result.profile.displayName); setBio(result.profile.bio);
      setNotice({ text: "Los cambios de tu perfil se han guardado." });
    } catch (error) { reportError(error); }
    finally { setBusy(""); }
  }
  function acceptAvatarProfile(next: MemberProfile) {
    setProfile(next);
    if (!dirty) { setDisplayName(next.displayName); setBio(next.bio); }
  }
  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.size || file.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice({ error: true, text: "Elige una imagen JPG, PNG o WebP de hasta 4 MB." }); return;
    }
    setBusy("avatar"); setNotice(null);
    try {
      const form = new FormData(); form.set("file", file);
      const result = await accountRequest<{ profile: MemberProfile }>("/api/account/avatar", "POST", form);
      // Photo changes are independent of the unsaved alias and biography.
      acceptAvatarProfile(result.profile); setNotice({ text: "Tu foto de perfil se ha actualizado." });
    } catch (error) { reportError(error); }
    finally { setBusy(""); }
  }
  async function resetAvatar() {
    setBusy("reset"); setNotice(null);
    try {
      const result = await accountRequest<{ profile: MemberProfile }>("/api/account/avatar", "DELETE");
      acceptAvatarProfile(result.profile); setNotice({ text: "Se ha restablecido la foto de Discord. Si no hay una disponible, se muestra el icono de perfil." });
    } catch (error) { reportError(error); }
    finally { setBusy(""); }
  }
  const discordButton = <button className={styles.primaryButton} type="button" disabled={!discordAvailable || Boolean(busy)} onClick={() => void startDiscord()}>
    {busy === "discord" ? <LoaderCircle size={18} className={styles.spinner} /> : <ArrowRight size={18} />} {busy === "discord" ? "Conectando con Discord…" : "Continuar con Discord"}
  </button>;

  return <div className={styles.page}>
    <a href="#account-content" className={styles.skipLink}>Saltar al contenido</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.logo} href="/index.html" aria-label="GameZone, inicio">GAMEZONE</a>
        <form className={styles.search} action="/buscar.html"><label htmlFor="account-search" className={styles.visuallyHidden}>Buscar juegos</label><input id="account-search" name="q" type="search" placeholder="Buscar juegos..." /><button type="submit" aria-label="Buscar"><Search size={18} /></button></form>
        <button ref={menuButton} className={styles.menuButton} type="button" aria-label={openMenu ? "Cerrar menú" : "Abrir menú"} aria-expanded={openMenu} aria-controls="account-navigation" onClick={() => setOpenMenu(!openMenu)}>{openMenu ? <X /> : <Menu />}</button>
        <nav ref={navigation} id="account-navigation" className={`${styles.navigation} ${openMenu ? styles.navigationOpen : ""}`} aria-label="Navegación principal">
          <a href="/index.html"><House size={18} aria-hidden="true" />Inicio</a><a href="/games.html"><Gamepad2 size={18} aria-hidden="true" />Juegos</a><a href="/noticias.html"><Newspaper size={18} aria-hidden="true" />Noticias</a><a href="/cuenta.html" aria-current="page"><UserRound size={18} aria-hidden="true" />Mi cuenta</a>
        </nav>
      </div>
    </header>
    <main id="account-content" className={styles.main}>
      <div className={styles.heading}><h1>Mi cuenta</h1><p>Gestiona tu perfil privado de GameZone.</p></div>
      {notice && <div className={`${styles.notice} ${notice.error ? styles.error : ""}`} role={notice.error ? "alert" : "status"}>{notice.error ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}<p>{notice.text}</p></div>}
      {profile ? <>
        <div className={styles.profileTop}><span className={styles.privateLabel}><ShieldCheck size={16} /> Perfil privado · solo tú puedes ver estos datos</span><button className={styles.textButton} type="button" disabled={Boolean(busy)} onClick={() => void logout()}>{busy === "logout" ? <LoaderCircle size={16} className={styles.spinner} /> : <LogOut size={16} />} Cerrar sesión</button></div>
        {!sessionExpired && discordAvailable && <div className={styles.reconnect} role="group" aria-label="Opciones de acceso">{discordButton}<p>Se abrirá la cuenta asociada al correo de Discord.</p></div>}
        {sessionExpired && <div className={styles.reconnect}>{discordButton}{!discordAvailable && <p>El acceso con Discord no está disponible en este momento.</p>}</div>}
        <div className={styles.profileGrid}>
          <section className={styles.avatarCard} aria-labelledby="avatar-title">
            <h2 id="avatar-title">Tu foto</h2><ProfileAvatar key={profile.avatarURL || "none"} url={profile.avatarURL} name={profile.displayName} />
            <input className={styles.visuallyHidden} tabIndex={-1} ref={fileInput} id="account-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar foto de perfil" disabled={controlsDisabled} onChange={event => void uploadAvatar(event)} />
            <button className={styles.secondaryButton} type="button" aria-controls="account-avatar-file" disabled={controlsDisabled} onClick={() => fileInput.current?.click()}>{busy === "avatar" ? <LoaderCircle size={17} className={styles.spinner} /> : <ImagePlus size={17} />} {busy === "avatar" ? "Subiendo foto…" : "Subir foto"}</button>
            {profile.avatarSource === "custom" && <button className={styles.textButton} type="button" disabled={controlsDisabled} onClick={() => void resetAvatar()}>{busy === "reset" ? <LoaderCircle size={14} className={styles.spinner} /> : <RefreshCw size={14} />} Usar foto de Discord</button>}
            <p className={styles.help}>JPG, PNG o WebP. Hasta 4 MB.<br />La foto se guarda al subirla.</p>
          </section>
          <section className={styles.formCard} aria-labelledby="profile-title">
            <h2 id="profile-title">Tu perfil</h2><p className={styles.cardDescription}>Tu alias y tu biografía permanecen privados en esta etapa de GameZone.</p>
            <form onSubmit={saveProfile}>
              <fieldset disabled={controlsDisabled} className={styles.fields}>
                <div className={styles.field}><label htmlFor="account-name">Alias</label><input id="account-name" name="displayName" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} autoComplete="nickname" required /><span className={styles.help}>El nombre que utilizas en GameZone. Hasta 80 caracteres.</span></div>
                <div className={styles.field}><label htmlFor="account-bio">Biografía</label><textarea id="account-bio" name="bio" rows={5} value={bio} maxLength={500} onChange={event => setBio(event.target.value)} aria-describedby="account-bio-help" /><span id="account-bio-help" className={styles.help}>{bio.length}/500 caracteres · solo visible para ti</span></div>
                <div className={styles.field}><label htmlFor="account-email">Correo electrónico <span className={styles.privateTag}>Privado</span></label><input id="account-email" value={profile.email || "No disponible"} readOnly aria-describedby="account-email-help" /><span id="account-email-help" className={styles.help}>El correo no se puede cambiar desde este formulario.</span></div>
                <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={!dirty || controlsDisabled}>{busy === "save" ? <LoaderCircle size={17} className={styles.spinner} /> : <Save size={17} />} {busy === "save" ? "Guardando…" : "Guardar cambios"}</button><button className={styles.textButton} type="button" disabled={!dirty || controlsDisabled} onClick={() => { setDisplayName(profile.displayName); setBio(profile.bio); }}>Descartar cambios</button></div>
              </fieldset>
            </form>
          </section>
        </div>
      </> : profileLoadError ? <section className={styles.loginCard}><CircleAlert size={40} className={styles.cardIcon} /><h2>No podemos cargar tu perfil</h2><p>Los datos guardados se conservan. Vuelve a intentarlo para continuar.</p><button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void reloadProfile()}>{busy === "reload" ? <LoaderCircle size={17} className={styles.spinner} /> : <RefreshCw size={17} />} Volver a cargar perfil</button></section> : <section className={styles.loginCard}>
        <UserRound size={43} className={styles.cardIcon} /><h2>Accede a tu cuenta</h2><p>Continúa con Discord para gestionar tu alias, biografía y foto de perfil.</p>{discordButton}
        {!discordAvailable && <p className={styles.configurationNote}>El acceso con Discord aún no está configurado. Vuelve a intentarlo más adelante.</p>}
        <span className={styles.loginPrivacy}><ShieldCheck size={15} /> Este espacio y tus datos de perfil son privados.</span>
      </section>}
    </main>
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}><a className={styles.footerLogo} href="/index.html">GameZone</a><p>Tu portal de juegos para PC.</p></div>
        <nav aria-labelledby="account-footer-links"><h2 id="account-footer-links">Enlaces rápidos</h2><a href="/index.html">Inicio</a><a href="/games.html">Juegos</a><a href="/noticias.html">Noticias</a></nav>
        <nav aria-labelledby="account-footer-legal"><h2 id="account-footer-legal">Legal</h2><a href="/dmca.html">DMCA</a><a href="/about.html">Acerca de</a></nav>
      </div>
      <div className={styles.footerBottom}>© {new Date().getFullYear()} GameZone</div>
    </footer>
  </div>;
}
