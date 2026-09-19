/* Pase de lista. Se escribe la matrícula, aparece el alumno y queda registrado. */

import {
  db, doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc,
  updateDoc, serverTimestamp, onSnapshot, increment
} from "../firebase.js";
import { estado, buscarAlumnos, cargarCatalogo, titulo } from "../app.js";
import {
  $, $$, esc, avisar, limpiaMatricula, rebote, cargando, vacio,
  hora, pitido, vibrar, confirmar, personalizar, enviarCorreo
} from "../utils.js";

let actividades = [];
let actual = null;
let registrados = new Map();   // matrícula → asistencia
let plantillasConfirmacion = new Map();   // principioId → HTML de la plantilla
let desuscribir = null;
const RECORDAR = "ibime.actividad";

export function salir() {
  desuscribir?.(); desuscribir = null;
  document.body.classList.remove("vista-fija");
}

export async function render(cont) {
  document.body.classList.add("vista-fija");
  titulo("Pase de lista", "Escribe la matrícula y el registro queda hecho");
  cont.innerHTML = cargando("Buscando las actividades del año…");

  if (!estado.catalogoListo) await cargarCatalogo();

  const anio = new Date().getFullYear();
  const snap = await getDocs(query(collection(db, "actividades"), where("anio", "==", anio)));
  actividades = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  if (!actividades.length) {
    cont.innerHTML = `<div class="caja">${vacio({
      titulo: "Aún no hay actividades este año",
      texto: "La administración crea la actividad desde Principios del año; en cuanto exista, aquí se pasa lista."
    })}</div>`;
    return;
  }

  const recordada = localStorage.getItem(RECORDAR);
  actual = actividades.find(a => a.id === recordada) || actividades[0];

  pintar(cont);
}

function pintar(cont) {
  cont.innerHTML = `
    <div class="cascada">
      <div class="caja">
        <div class="filtros">
          <div class="campo">
            <label for="sel-act">Actividad</label>
            <select id="sel-act">
              ${actividades.map(a => `<option value="${a.id}" ${a.id === actual.id ? "selected" : ""}>
                ${esc(a.fecha)} · ${esc(a.titulo)}</option>`).join("")}
            </select>
          </div>
          <div class="campo">
            <label for="auto">Registro automático</label>
            <select id="auto">
              <option value="1">Sí, guarda en cuanto reconoce la matrícula</option>
              <option value="0">No, confirmo yo cada alumno</option>
            </select>
          </div>
        </div>
      </div>

      <div class="pase">
        <div class="buscador">
          <h2>Matrícula del alumno</h2>
          <p>Teclea o escanea. No hace falta presionar nada más.</p>
          <input id="q" type="text" inputmode="text" autocomplete="off" autocapitalize="characters"
                 spellcheck="false" enterkeyhint="done" placeholder="Ej. 20240815">
          <div id="resultado"></div>
        </div>

        <div class="caja">
          <div class="caja__cab">
            <div><h2>Van <span id="cuenta" class="num">0</span></h2><p id="cuenta-sub">registros en esta actividad</p></div>
          </div>
          <div id="recientes" class="recientes"></div>
        </div>
      </div>
    </div>`;

  $("#sel-act").addEventListener("change", e => {
    actual = actividades.find(a => a.id === e.target.value);
    localStorage.setItem(RECORDAR, actual.id);
    escuchar();
    $("#q").focus();
  });

  const q = $("#q");
  q.addEventListener("input", rebote(() => evaluar(q.value), 130));
  q.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const auto = $("#auto").value === "1";
    if (!auto) return;   // en modo manual, Enter no registra: hay que dar clic en "Registrar asistencia"
    const { exacto, parecidos } = buscarAlumnos(q.value);
    const elegido = exacto || (parecidos.length === 1 ? parecidos[0] : null);
    if (elegido) registrar(elegido);
    else avisar("Esa matrícula no aparece en la base.", "mal");
  });

  escuchar();
  setTimeout(() => q.focus(), 150);
}

function pintarRecientes() {
  desuscribir?.();
  registrados = new Map();
  desuscribir = onSnapshot(
    query(collection(db, "asistencias"), where("actividadId", "==", actual.id)),
    snap => {
      registrados = new Map(snap.docs.map(d => [d.data().matricula, { id: d.id, ...d.data() }]));
      pintarRecientes();
    },
    err => { console.error(err); avisar("No se pudo escuchar la lista en vivo.", "mal"); }
  );
}

function pintarRecientes() {
  $("#cuenta").textContent = registrados.size;
  $("#cuenta-sub").textContent = registrados.size === 1 ? "registro en esta actividad" : "registros en esta actividad";
  const lista = [...registrados.values()]
    .sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0))
    .slice(0, 40);

  const cont = $("#recientes");
  if (!lista.length) {
    cont.innerHTML = `<p style="color:var(--tinta-suave);font-size:.9rem">Nadie registrado todavía. El primero aparece aquí.</p>`;
    return;
  }
  cont.innerHTML = lista.map(a => `
    <div class="reciente">
      <i></i>
      <div>
        <strong>${esc(a.nombre)}</strong>
        <span>${esc(a.matricula)} · ${esc(a.grado)}${esc(a.grupo)} · ${esc(a.plantel)}</span>
      </div>
      <button class="iconbtn" style="color:var(--tinta-suave)" data-quita="${esc(a.matricula)}" title="Quitar registro">✕</button>
    </div>`).join("");

  $$("[data-quita]", cont).forEach(b =>
    b.addEventListener("click", () => quitar(b.dataset.quita)));
}

/* ---------- búsqueda ---------- */
function evaluar(texto) {
  const caja = $("#resultado");
  const t = texto.trim();
  if (t.length < 2) { caja.innerHTML = ""; return; }

  const { exacto, parecidos } = buscarAlumnos(t);

  if (exacto) {
    const auto = $("#auto").value === "1";
    const otrosQueEmpiezanIgual = estado.alumnos.some(a => {
      const m = limpiaMatricula(a.matricula);
      return m !== limpiaMatricula(t) && m.startsWith(limpiaMatricula(t));
    });
    caja.innerHTML = ficha(exacto);
    $("[data-reg]", caja)?.addEventListener("click", () => registrar(exacto));
    if (auto && !otrosQueEmpiezanIgual) registrar(exacto);
    return;
  }

  if (parecidos.length) {
    caja.innerHTML = `<div class="sugerencias">${parecidos.map(a => `
      <button class="sugerencia" data-pick="${esc(a.matricula)}">
        <span style="flex:1"><b>${esc(a.matricula)}</b> — ${esc(a.nombre)}</span>
        <span>${esc(a.grado)}${esc(a.grupo)}</span>
      </button>`).join("")}</div>`;
    $$("[data-pick]", caja).forEach(b => b.addEventListener("click", () => {
      const al = estado.porMatricula.get(limpiaMatricula(b.dataset.pick));
      if (al) registrar(al);
    }));
    return;
  }

  caja.innerHTML = `<div class="ficha"><div class="ficha__aviso ficha__aviso--no">
      Ninguna matrícula ni nombre coincide con “${esc(t)}”. Revisa el dato o actualiza la base de alumnos.
    </div></div>`;
}

function ficha(a, aviso = "") {
  const ya = registrados.has(String(a.matricula));
  return `<div class="ficha">
    <div class="ficha__nom">${esc(a.nombre)}</div>
    <div class="ficha__mat">${esc(a.matricula)}</div>
    <div class="ficha__meta">
      <span class="pill">${esc(a.plantel)}</span>
      <span class="pill">${esc(a.nivel)}</span>
      <span class="pill">${esc(a.grado)}° ${esc(a.grupo)}</span>
    </div>
    ${aviso || (ya
      ? `<div class="ficha__aviso ficha__aviso--rep">Ya estaba registrado a las ${hora(new Date((registrados.get(String(a.matricula))?.ts?.seconds || 0) * 1000))}.</div>`
      : `<button class="btn btn--ancho" style="margin-top:14px" data-reg>Registrar asistencia</button>`)}
  </div>`;
}

/* ---------- registro ---------- */
let guardando = false;

async function registrar(al) {
  if (guardando) return;
  const matricula = String(al.matricula);

  if (registrados.has(matricula)) {
    $("#resultado").innerHTML = ficha(al);
    avisar(`${primerNombre(al.nombre)} ya estaba en la lista.`, "aviso", 2200);
    vibrar(30);
    limpiar();
    return;
  }

  guardando = true;
  const id = `${actual.id}__${matricula}`;

  const registro = {
    actividadId: actual.id,
    actividadTitulo: actual.titulo,
    principioId: actual.principioId,
    principioTitulo: actual.principioTitulo || "",
    anio: actual.anio, mes: actual.mes,
    fecha: actual.fecha, periodo: actual.periodo || String(actual.fecha).slice(0, 7),
    puntos: actual.puntos ?? 1,
    matricula,
    nombre: al.nombre, plantel: al.plantel, nivel: al.nivel,
    grado: String(al.grado), grupo: String(al.grupo), correo: al.correo || "",
    registradoPorNombre: estado.perfil.nombre,
    registradoPorUid: estado.usuario.uid,
    ts: serverTimestamp()
  };

  /* La lista de pantalla se actualiza al instante; la escritura viaja sola. */
  registrados.set(matricula, { ...registro, id, ts: { seconds: Date.now() / 1000 } });
  pintarRecientes();
  $("#resultado").innerHTML = ficha(al,
    `<div class="ficha__aviso ficha__aviso--ok">Asistencia registrada. ${esc(primerNombre(al.nombre))} suma ${actual.puntos ?? 1} punto${(actual.puntos ?? 1) === 1 ? "" : "s"}.</div>`);
  pitido(true); vibrar(18);
  limpiar();

  try {
    await setDoc(doc(db, "asistencias", id), registro);
    updateDoc(doc(db, "actividades", actual.id), { total: increment(1) }).catch(() => {});
    mandarConfirmacion(registro);
  } catch (err) {
    console.error(err);
    registrados.delete(matricula); pintarRecientes();
    avisar("No se guardó el registro. Inténtalo otra vez.", "mal", 4500);
  } finally {
    guardando = false;
  }
}

/* Manda el correo de confirmación con la plantilla del principio del mes (no bloquea la UI). */
async function mandarConfirmacion(registro) {
  if (!registro.correo || !registro.principioId) return;
  try {
    let html = plantillasConfirmacion.get(registro.principioId);
    if (html === undefined) {
      const snap = await getDoc(doc(db, "principios", registro.principioId));
      html = snap.exists() ? (snap.data().correoConfirmacion || null) : null;
      plantillasConfirmacion.set(registro.principioId, html);
    }
    if (!html) return;
    await enviarCorreo({
      to: registro.correo,
      subject: `Asistencia registrada — ${registro.actividadTitulo}`,
      html: personalizar(html, registro)
    });
  } catch (err) { console.error("No se pudo mandar la confirmación:", err); }
}

async function quitar(matricula) {
  const a = registrados.get(String(matricula));
  if (!a) return;
  if (!await confirmar("¿Quitar este registro?", `${a.nombre} dejará de aparecer en el informe.`, "Quitar")) return;
  try {
    await deleteDoc(doc(db, "asistencias", `${actual.id}__${matricula}`));
    updateDoc(doc(db, "actividades", actual.id), { total: increment(-1) }).catch(() => {});
    avisar("Registro quitado.", "ok");
  } catch { avisar("No se pudo quitar el registro.", "mal"); }
}

function limpiar() {
  const q = $("#q");
  q.value = "";
  q.focus();
}

const primerNombre = n => String(n || "").trim().split(/\s+/).slice(-2, -1)[0] || String(n || "").split(/\s+/)[0];
