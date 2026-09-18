/* Los doce principios del año: uno por mes, con su banner y sus actividades. */

import {
  db, doc, setDoc, getDocs, collection, query, where, deleteDoc, addDoc, serverTimestamp
} from "../firebase.js";
import { PRINCIPIOS_BASE, MESES } from "../config.js";
import { estado, titulo } from "../app.js";
import {
  $, $$, esc, avisar, abrirModal, confirmar, imagenAdataURL,
  nombreMes, cargando, hoyISO
} from "../utils.js";

let anio = new Date().getFullYear();
let principios = [];
let actividades = [];

export async function render(cont) {
  titulo("Principios del año", "Un valor por mes, con su imagen y sus actividades");
  cont.innerHTML = cargando("Trayendo el calendario de valores…");
  await traer();
  pintar(cont);
}

async function traer() {
  const [p, a] = await Promise.all([
    getDocs(query(collection(db, "principios"), where("anio", "==", anio))),
    getDocs(query(collection(db, "actividades"), where("anio", "==", anio)))
  ]);
  const guardados = new Map(p.docs.map(d => [d.data().mes, { id: d.id, ...d.data() }]));
  principios = MESES.map((_, i) => {
    const mes = i + 1;
    const base = PRINCIPIOS_BASE.find(b => b.mes === mes) || {};
    return guardados.get(mes) || { id: `${anio}_${mes}`, anio, mes, titulo: base.titulo || "", lema: base.lema || "", descripcion: "", banner: "", _nuevo: true };
  });
  actividades = a.docs.map(d => ({ id: d.id, ...d.data() }));
}

function pintar(cont) {
  const anios = [];
  for (let y = new Date().getFullYear() + 1; y >= 2023; y--) anios.push(y);

  cont.innerHTML = `
    <div class="cascada">
      <div class="caja">
        <div class="caja__cab">
          <div>
            <h2>Calendario de valores ${anio}</h2>
            <p>Cada mes guarda su principio, su banner y las actividades donde se pasa lista.</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <select id="anio" class="campo" style="min-height:42px;padding:8px 12px;border:1.5px solid var(--linea);border-radius:8px">
              ${anios.map(y => `<option value="${y}" ${y === anio ? "selected" : ""}>${y}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="rejilla rejilla--meses">
          ${principios.map(tarjeta).join("")}
        </div>
      </div>
    </div>`;

  $("#anio").addEventListener("change", async e => {
    anio = +e.target.value;
    cont.innerHTML = cargando();
    await traer(); pintar(cont);
  });

  $$("[data-editar]").forEach(b => b.addEventListener("click", () => editarPrincipio(+b.dataset.editar, cont)));
  $$("[data-acts]").forEach(b => b.addEventListener("click", () => verActividades(+b.dataset.acts, cont)));
}

function tarjeta(p) {
  const acts = actividades.filter(a => a.mes === p.mes);
  const sinTitulo = !p.titulo;
  return `
    <article class="mes">
      ${p.banner
        ? `<div class="mes__banner" style="background-image:url('${p.banner}')"><span class="mes__num">${p.mes}</span></div>`
        : `<div class="mes__banner mes__banner--vacio"><img src="assets/escudo-ibime.png" alt=""><span class="mes__num">${p.mes}</span></div>`}
      <div class="mes__cuerpo">
        <span class="mes__mes">${esc(nombreMes(p.mes))}</span>
        <h3 class="mes__tit">${esc(p.titulo || "Sin principio asignado")}</h3>
        <p class="mes__desc">${esc(p.lema || p.descripcion || (sinTitulo ? "Define el valor de este mes." : ""))}</p>
        <div class="mes__pie">
          <span class="pill">${acts.length} ${acts.length === 1 ? "actividad" : "actividades"}</span>
          <button class="btn btn--suave btn--chico" data-acts="${p.mes}">Actividades</button>
          <button class="btn btn--linea btn--chico" data-editar="${p.mes}">Editar</button>
        </div>
      </div>
    </article>`;
}

/* ---------- editar el principio del mes ---------- */
function editarPrincipio(mes, cont) {
  const p = principios.find(x => x.mes === mes);
  let bannerNuevo = null;

  abrirModal({
    titulo: `${nombreMes(mes)} de ${anio}`,
    sub: "El banner queda guardado como histórico de la campaña.",
    cuerpo: `
      <div class="campo"><label for="f-tit">Principio</label>
        <input id="f-tit" value="${esc(p.titulo)}" placeholder="Respeto" maxlength="40"></div>
      <div class="campo"><label for="f-lema">Lema</label>
        <input id="f-lema" value="${esc(p.lema || "")}" placeholder="El otro también importa." maxlength="90"></div>
      <div class="campo"><label for="f-desc">Cómo se vive este mes</label>
        <textarea id="f-desc" placeholder="Qué se espera de alumnos y docentes durante el mes.">${esc(p.descripcion || "")}</textarea></div>
      <div class="campo"><label for="f-img">Banner de la campaña</label>
        <input id="f-img" type="file" accept="image/*">
        <small>Se reduce y comprime en tu equipo antes de guardarse. Ideal 1400 × 600 px.</small></div>
      <div id="prev">${p.banner ? `<img src="${p.banner}" alt="Banner actual" style="border-radius:10px">` : ""}</div>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Guardar mes", clase: "btn", fn: async () => {
          const t = $("#f-tit").value.trim();
          if (!t) { avisar("Escribe el principio del mes.", "mal"); return false; }
          const datos = {
            anio, mes,
            titulo: t,
            lema: $("#f-lema").value.trim(),
            descripcion: $("#f-desc").value.trim(),
            actualizado: serverTimestamp(),
            actualizadoPor: estado.perfil.nombre
          };
          if (bannerNuevo) datos.banner = bannerNuevo;
          await setDoc(doc(db, "principios", `${anio}_${mes}`), datos, { merge: true });
          avisar(`${nombreMes(mes)} guardado.`, "ok");
          await traer(); pintar(cont);
        } }
    ],
    alAbrir: () => {
      $("#f-img").addEventListener("change", async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          bannerNuevo = await imagenAdataURL(f);
          $("#prev").innerHTML = `<img src="${bannerNuevo}" alt="Vista previa" style="border-radius:10px">`;
        } catch (err) { avisar(err.message, "mal"); }
      });
    }
  });
}

/* ---------- actividades del mes ---------- */
function verActividades(mes, cont) {
  const p = principios.find(x => x.mes === mes);
  const lista = actividades.filter(a => a.mes === mes).sort((a, b) => (a.fecha > b.fecha ? 1 : -1));

  abrirModal({
    titulo: `Actividades de ${nombreMes(mes)}`,
    sub: p.titulo ? `Principio: ${p.titulo}` : "Primero define el principio de este mes.",
    cuerpo: lista.length ? `
      <div class="tablabox"><table>
        <thead><tr><th>Actividad</th><th>Fecha</th><th>Asistencias</th><th></th></tr></thead>
        <tbody>${lista.map(a => `
          <tr>
            <td><strong>${esc(a.titulo)}</strong><br><span style="font-size:.8rem;color:var(--tinta-suave)">${esc(a.lugar || "")}</span></td>
            <td class="num">${esc(a.fecha)}</td>
            <td class="num">${a.total || 0}</td>
            <td><button class="btn btn--linea btn--chico" data-borra="${a.id}">Quitar</button></td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<p style="color:var(--tinta-suave);font-size:.9rem">Todavía no hay actividades registradas para este mes.</p>`,
    acciones: [
      { texto: "Cerrar" },
      { texto: "Nueva actividad", clase: "btn", fn: () => { nuevaActividad(mes, cont); return true; } }
    ],
    alAbrir: dlg => {
      $$("[data-borra]", dlg).forEach(b => b.addEventListener("click", async () => {
        if (!await confirmar("¿Quitar la actividad?",
          "Las asistencias ya registradas se conservan en los informes.", "Quitar")) return;
        await deleteDoc(doc(db, "actividades", b.dataset.borra));
        avisar("Actividad quitada.", "ok");
        await traer(); pintar(cont);
      }));
    }
  });
}

function nuevaActividad(mes, cont) {
  const p = principios.find(x => x.mes === mes);
  setTimeout(() => abrirModal({
    titulo: "Nueva actividad",
    sub: `${nombreMes(mes)} · ${p.titulo || "sin principio"}`,
    cuerpo: `
      <div class="campo"><label for="a-tit">Nombre de la actividad</label>
        <input id="a-tit" placeholder="Jornada de limpieza en la colonia" maxlength="90"></div>
      <div class="filtros">
        <div class="campo"><label for="a-fecha">Fecha</label>
          <input id="a-fecha" type="date" value="${hoyISO()}"></div>
        <div class="campo"><label for="a-puntos">Puntos extra</label>
          <input id="a-puntos" type="number" min="0" max="10" step="0.5" value="1"></div>
      </div>
      <div class="campo"><label for="a-lugar">Lugar</label>
        <input id="a-lugar" placeholder="Explanada del plantel Norte" maxlength="80"></div>
      <div class="campo"><label for="a-desc">Descripción</label>
        <textarea id="a-desc" placeholder="En qué consiste y qué se espera de los alumnos."></textarea></div>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Crear actividad", clase: "btn", fn: async () => {
          const t = $("#a-tit").value.trim(), f = $("#a-fecha").value;
          if (!t || !f) { avisar("Falta el nombre o la fecha.", "mal"); return false; }
          if (!p.titulo) { avisar("Primero define el principio del mes.", "mal"); return false; }
          await addDoc(collection(db, "actividades"), {
            anio, mes, principioId: `${anio}_${mes}`, principioTitulo: p.titulo,
            titulo: t, fecha: f, lugar: $("#a-lugar").value.trim(),
            descripcion: $("#a-desc").value.trim(),
            puntos: Number($("#a-puntos").value) || 0,
            periodo: f.slice(0, 7), total: 0, abierta: true,
            creado: serverTimestamp(), creadoPor: estado.perfil.nombre
          });
          avisar("Actividad creada. Ya puedes pasar lista.", "ok");
          await traer(); pintar(cont);
        } }
    ]
  }), 120);
}
