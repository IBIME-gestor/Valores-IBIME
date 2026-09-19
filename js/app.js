/* ============================================================
   Principios IBIME — núcleo
   Sesión, roles, catálogo de alumnos en memoria y enrutador.
   ============================================================ */

import {
  auth, db, entrar, salir, onAuthStateChanged, getRedirectResult,
  doc, getDoc, setDoc, getDocs, collection, serverTimestamp
} from "./firebase.js";
import { DOMINIO_INSTITUCIONAL, ADMINS_SEMILLA, AJUSTES } from "./config.js";
import { $, $$, esc, avisar, limpiaMatricula, norm } from "./utils.js";

/* ---------- estado compartido ---------- */
export const estado = {
  usuario: null,          // cuenta de Google
  perfil: null,           // documento en /usuarios
  alumnos: [],            // catálogo completo
  porMatricula: new Map(),// matrícula → alumno
  catalogoListo: false
};

export const esAdmin = () => estado.perfil?.rol === "admin";

/* ============================================================
   SESIÓN
   ============================================================ */
const gate = $("#gate"), shell = $("#shell"), boot = $("#boot"), gateMsg = $("#gate-msg");

$("#btn-login").addEventListener("click", async e => {
  const b = e.currentTarget;
  b.disabled = true; gateMsg.textContent = "";
  try { await entrar(); }
  catch (err) { gateMsg.textContent = mensajeDeError(err); b.disabled = false; }
});

$("#btn-logout").addEventListener("click", async () => { await salir(); location.hash = ""; location.reload(); });

getRedirectResult(auth).catch(err => { gateMsg.textContent = mensajeDeError(err); });

onAuthStateChanged(auth, async usuario => {
  if (!usuario) {
    estado.usuario = null; estado.perfil = null;
    boot.hidden = true; shell.hidden = true; gate.hidden = false;
    return;
  }

  const correo = (usuario.email || "").toLowerCase();

  if (DOMINIO_INSTITUCIONAL && !correo.endsWith("@" + DOMINIO_INSTITUCIONAL)) {
    await salir();
    boot.hidden = true; shell.hidden = true; gate.hidden = false;
    gateMsg.textContent = `Entra con tu correo @${DOMINIO_INSTITUCIONAL}. Esa cuenta no pertenece al colegio.`;
    return;
  }

  estado.usuario = usuario;
  gate.hidden = true; boot.hidden = false;

  try {
    estado.perfil = await registrarPerfil(usuario);
  } catch (err) {
    console.error(err);
    boot.hidden = true; gate.hidden = false;
    gateMsg.textContent = "No se pudo abrir tu perfil. Revisa las reglas de Firestore e inténtalo otra vez.";
    await salir();
    return;
  }

  pintarUsuario();
  shell.hidden = false;
  boot.hidden = true;
  medirViewport();

  cargarCatalogo();          // en segundo plano
  window.addEventListener("hashchange", enrutar);
  enrutar();
});

/* Primer ingreso: se crea el perfil con rol Colaborador IBIME.
   Nadie tiene que dar de alta a nadie. */
async function registrarPerfil(u) {
  const ref = doc(db, "usuarios", u.uid);
  const snap = await getDoc(ref);
  const correo = (u.email || "").toLowerCase();
  const semilla = ADMINS_SEMILLA.map(c => c.toLowerCase()).includes(correo);

  if (!snap.exists()) {
    const nuevo = {
      correo,
      nombre: u.displayName || correo.split("@")[0],
      foto: u.photoURL || "",
      rol: semilla ? "admin" : "colaborador",
      activo: true,
      creado: serverTimestamp(),
      ultimoAcceso: serverTimestamp()
    };
    await setDoc(ref, nuevo);
    return { ...nuevo, id: u.uid };
  }

  const datos = snap.data();
  if (datos.activo === false) throw new Error("cuenta suspendida");

  // se refresca lo que cambia solo; el rol nunca se toca desde aquí
  const parche = { ultimoAcceso: serverTimestamp() };
  if (u.displayName && u.displayName !== datos.nombre) parche.nombre = u.displayName;
  if (u.photoURL && u.photoURL !== datos.foto) parche.foto = u.photoURL;
  if (semilla && datos.rol !== "admin") parche.rol = "admin";
  await setDoc(ref, parche, { merge: true });

  return { ...datos, ...parche, id: u.uid, rol: parche.rol || datos.rol };
}

function pintarUsuario() {
  const p = estado.perfil;
  $("#u-nombre").textContent = p.nombre;
  const rol = $("#u-rol");
  rol.textContent = esAdmin() ? "Administrador" : "Colaborador IBIME";
  rol.classList.toggle("tag--colab", !esAdmin());
  if (p.foto) $("#u-foto").src = p.foto;
  $$(".admin-only").forEach(el => { el.hidden = !esAdmin(); });
}

function mensajeDeError(err) {
  const c = err?.code || "";
  if (c === "auth/unauthorized-domain")
    return "Este sitio todavía no está autorizado en Firebase. Agrégalo en Authentication → Settings → Dominios autorizados.";
  if (c === "auth/network-request-failed") return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  if (c === "auth/popup-blocked") return "Tu navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio.";
  if (String(err?.message).includes("suspendida")) return "Tu acceso está suspendido. Habla con la dirección.";
  return "No se pudo iniciar sesión. Inténtalo otra vez.";
}

/* ============================================================
   CATÁLOGO DE ALUMNOS
   Se lee una vez y se guarda en el dispositivo: la búsqueda por
   matrícula en el patio es instantánea, sin ir a la red.
   ============================================================ */
const LLAVE_CACHE = "ibime.alumnos.v1";

export async function cargarCatalogo({ forzar = false } = {}) {
  try {
    const metaSnap = await getDoc(doc(db, "meta", "alumnos"));
    const version = metaSnap.exists() ? (metaSnap.data().version || 0) : 0;

    if (!forzar) {
      const cache = leerCache();
      if (cache && cache.version === version && cache.edadHoras < AJUSTES.cacheAlumnosHoras) {
        aplicarCatalogo(cache.alumnos);
        return estado.alumnos;
      }
    }

    const snap = await getDocs(collection(db, "alumnos"));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    aplicarCatalogo(lista);
    guardarCache(lista, version);
    return lista;
  } catch (err) {
    console.error(err);
    const cache = leerCache();
    if (cache) { aplicarCatalogo(cache.alumnos); avisar("Trabajando con la copia guardada en este dispositivo.", "aviso"); }
    return estado.alumnos;
  }
}

function aplicarCatalogo(lista) {
  estado.alumnos = lista;
  estado.porMatricula = new Map(lista.map(a => [limpiaMatricula(a.matricula), a]));
  estado.catalogoListo = true;
  lista.forEach(a => { a._busca = norm(`${a.matricula} ${a.nombre}`); });
  document.dispatchEvent(new CustomEvent("catalogo:listo"));
}

function guardarCache(alumnos, version) {
  try {
    localStorage.setItem(LLAVE_CACHE, JSON.stringify({ version, ts: Date.now(), alumnos }));
  } catch { /* si no cabe, se trabaja en línea */ }
}

function leerCache() {
  try {
    const crudo = localStorage.getItem(LLAVE_CACHE);
    if (!crudo) return null;
    const c = JSON.parse(crudo);
    c.edadHoras = (Date.now() - c.ts) / 3.6e6;
    return Array.isArray(c.alumnos) ? c : null;
  } catch { return null; }
}

export const limpiarCacheAlumnos = () => localStorage.removeItem(LLAVE_CACHE);

/* Busca por matrícula exacta o por coincidencias de nombre. */
export function buscarAlumnos(texto, tope = 8) {
  const t = String(texto || "").trim();
  if (t.length < 2) return { exacto: null, parecidos: [] };

  const exacto = estado.porMatricula.get(limpiaMatricula(t)) || null;
  if (exacto) return { exacto, parecidos: [] };

  const n = norm(t);
  const parecidos = [];
  for (const a of estado.alumnos) {
    if (a._busca.includes(n)) { parecidos.push(a); if (parecidos.length >= tope) break; }
  }
  return { exacto: null, parecidos };
}

/* ============================================================
   ENRUTADOR
   ============================================================ */
const vistas = {
  inicio:     () => import("./views/inicio.js"),
  asistencia: () => import("./views/asistencia.js"),
  consulta:   () => import("./views/consulta.js"),
  principios: () => import("./views/principios.js"),
  alumnos:    () => import("./views/alumnos.js"),
  usuarios:   () => import("./views/usuarios.js")
};
const soloAdmin = ["principios", "alumnos", "usuarios"];

export function titulo(t, sub = "") {
  $("#view-title").textContent = t;
  $("#view-sub").textContent = sub;
  document.title = `${t} · Principios IBIME`;
}

let vistaActual = null;

async function enrutar() {
  const ruta = (location.hash.replace(/^#\//, "").split("?")[0]) || "inicio";
  const nombre = vistas[ruta] ? ruta : "inicio";

  if (soloAdmin.includes(nombre) && !esAdmin()) {
    avisar("Esa sección es solo para la administración.", "aviso");
    location.hash = "#/inicio";
    return;
  }

  $$("#nav .navlink").forEach(a => a.classList.toggle("is-on", a.dataset.nav === nombre));
  cerrarMenu();

  const cont = $("#view");
  cont.innerHTML = `<div class="cargando"><i class="spin"></i>Abriendo…</div>`;

  try {
    vistaActual?.salir?.();
    const mod = await vistas[nombre]();
    vistaActual = mod;
    await mod.render(cont);
    cont.scrollIntoView({ block: "start" });
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    cont.innerHTML = `<div class="caja"><h2>Esta sección no abrió</h2>
      <p style="margin-top:8px;color:var(--tinta-suave)">${esc(err.message || "Error inesperado")}</p>
      <button class="btn btn--suave" style="margin-top:16px" onclick="location.reload()">Recargar</button></div>`;
  }
}

/* ---------- menú lateral en móvil ---------- */
const abrirMenu  = () => { shell.classList.add("menu-abierto"); $("#scrim").hidden = false; };
const cerrarMenu = () => { shell.classList.remove("menu-abierto"); $("#scrim").hidden = true; };
$("#btn-menu").addEventListener("click", abrirMenu);
$("#scrim").addEventListener("click", cerrarMenu);
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarMenu(); });

/* ---------- medidas reales de pantalla ----------
   El alto del topbar puede variar (notch, tamaño de letra del sistema),
   y el teclado en pantalla reduce el alto visible sin cambiar 100vh/100dvh
   en todos los navegadores. Estas dos variables CSS se mantienen al día
   para que el cuadro de matrícula (fijo) y sus sugerencias siempre
   quepan en lo que realmente se ve.
   Ojo: mientras la sesión no ha entrado, el topbar está oculto (alto 0);
   por eso solo se guarda su medida cuando de verdad tiene tamaño, y se
   usa ResizeObserver para volver a medir en cuanto aparece o cambia. */
function medirViewport() {
  const tb = document.querySelector(".topbar");
  if (tb && tb.offsetHeight > 0) document.documentElement.style.setProperty("--topbar-h", `${tb.offsetHeight}px`);
  const vv = window.visualViewport;
  document.documentElement.style.setProperty("--vvh", `${Math.round(vv ? vv.height : window.innerHeight)}px`);
}
window.addEventListener("resize", medirViewport);
window.addEventListener("orientationchange", medirViewport);
window.visualViewport?.addEventListener("resize", medirViewport);
window.visualViewport?.addEventListener("scroll", medirViewport);
medirViewport();

const topbarEl = document.querySelector(".topbar");
if (topbarEl && "ResizeObserver" in window) {
  new ResizeObserver(medirViewport).observe(topbarEl);
} else {
  // Respaldo si el navegador no tiene ResizeObserver: reintenta poco
  // después de entrar, cuando el topbar ya es visible.
  setTimeout(medirViewport, 300);
}

/* ---------- estado de la red ---------- */
function pintarRed() {
  const n = $("#net"), enLinea = navigator.onLine;
  n.classList.toggle("is-off", !enLinea);
  n.querySelector("span").textContent = enLinea ? "En línea" : "Sin conexión";
}
window.addEventListener("online", () => { pintarRed(); avisar("Conexión restablecida. Sincronizando.", "ok"); });
window.addEventListener("offline", () => { pintarRed(); avisar("Sin conexión. Los registros se guardan y se envían al volver la señal.", "aviso", 5000); });
pintarRed();
