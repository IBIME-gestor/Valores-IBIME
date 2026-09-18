/* Panel: qué principio toca hoy y cómo va el mes. */

import { db, getDocs, getDoc, doc, collection, query, where } from "../firebase.js";
import { PRINCIPIOS_BASE } from "../config.js";
import { estado, esAdmin, titulo, cargarCatalogo } from "../app.js";
import { esc, cargando, nombreMes, fechaLarga, fechaCorta } from "../utils.js";

export async function render(cont) {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1, anio = hoy.getFullYear();
  const periodo = `${anio}-${String(mes).padStart(2, "0")}`;

  titulo(`Hola, ${primerNombre(estado.perfil.nombre)}`, fechaLarga(hoy));
  cont.innerHTML = cargando("Preparando el panel…");

  const [pSnap, aSnap, asisSnap] = await Promise.all([
    getDoc(doc(db, "principios", `${anio}_${mes}`)),
    getDocs(query(collection(db, "actividades"), where("periodo", "==", periodo))),
    getDocs(query(collection(db, "asistencias"), where("periodo", "==", periodo)))
  ]);

  const base = PRINCIPIOS_BASE.find(b => b.mes === mes) || {};
  const p = pSnap.exists() ? pSnap.data() : { titulo: "", lema: base.lema || "", descripcion: "" };
  const acts = aSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const asis = asisSnap.docs.map(d => d.data());

  if (!estado.catalogoListo) cargarCatalogo();

  const alumnosDistintos = new Set(asis.map(a => a.matricula)).size;
  const puntos = asis.reduce((s, a) => s + (Number(a.puntos) || 0), 0);
  const proxima = acts.find(a => a.fecha >= hoy.toLocaleDateString("sv-SE"));

  cont.innerHTML = `
    <div class="cascada">
      <section class="mes" style="border:0">
        ${p.banner
          ? `<div class="mes__banner" style="aspect-ratio:auto;min-height:180px;background-image:url('${p.banner}')"></div>`
          : `<div class="mes__banner mes__banner--vacio" style="aspect-ratio:auto;min-height:132px"><img src="assets/escudo-ibime.png" alt="" style="width:58px"></div>`}
        <div class="mes__cuerpo" style="padding:22px 24px 24px">
          <span class="mes__mes">${esc(nombreMes(mes))} ${anio} · principio ${mes} de 12</span>
          <h2 class="mes__tit" style="font-size:1.9rem">${esc(p.titulo || base.titulo || "Principio por definir")}</h2>
          <p class="mes__desc" style="max-width:62ch">${esc(p.lema || base.lema || "")}${p.descripcion ? " " + esc(p.descripcion) : ""}</p>
          ${!p.titulo && esAdmin()
            ? `<div class="mes__pie"><a class="btn btn--chico" href="#/principios">Definir el principio de este mes</a></div>` : ""}
        </div>
      </section>

      <div class="rejilla rejilla--4">
        <div class="dato"><b>${acts.length}</b><span>actividades este mes</span></div>
        <div class="dato dato--rojo"><b>${asis.length}</b><span>asistencias registradas</span></div>
        <div class="dato"><b>${alumnosDistintos}</b><span>alumnos participaron</span></div>
        <div class="dato"><b>${puntos % 1 ? puntos.toFixed(1) : puntos}</b><span>puntos extra generados</span></div>
      </div>

      <div class="caja">
        <div class="caja__cab">
          <div><h2>Actividades de ${esc(nombreMes(mes))}</h2>
            <p>${proxima ? `La siguiente es el ${fechaCorta(proxima.fecha + "T12:00:00")}.` : "Ya pasaron todas las programadas."}</p></div>
          <a class="btn btn--chico" href="#/asistencia">Pasar lista</a>
        </div>
        ${acts.length ? `<div class="tablabox"><table>
          <thead><tr><th>Actividad</th><th>Fecha</th><th>Lugar</th><th>Asistencias</th></tr></thead>
          <tbody>${acts.map(a => `<tr>
            <td><strong>${esc(a.titulo)}</strong></td>
            <td class="num">${esc(fechaCorta(a.fecha + "T12:00:00"))}</td>
            <td style="color:var(--tinta-suave)">${esc(a.lugar || "—")}</td>
            <td class="num">${asis.filter(x => x.actividadId === a.id).length}</td>
          </tr>`).join("")}</tbody></table></div>`
        : `<p style="color:var(--tinta-suave);font-size:.9rem">Todavía no hay actividades programadas para este mes.</p>`}
      </div>

      <div class="caja">
        <div class="caja__cab"><div><h2>Qué puedes hacer aquí</h2></div></div>
        <div class="rejilla rejilla--3">
          <a class="dato" href="#/asistencia" style="text-decoration:none">
            <b style="font-size:1.1rem">Pasar lista</b>
            <span>Escribe la matrícula y el alumno queda registrado al momento.</span></a>
          <a class="dato" href="#/consulta" style="text-decoration:none">
            <b style="font-size:1.1rem">Sacar el informe</b>
            <span>Filtra por plantel, nivel, grado y grupo, y descárgalo para los docentes.</span></a>
          ${esAdmin() ? `<a class="dato" href="#/alumnos" style="text-decoration:none">
            <b style="font-size:1.1rem">Actualizar alumnos</b>
            <span>Sube el Excel del colegio cuando cambien los grupos.</span></a>` : ""}
        </div>
      </div>
    </div>`;
}

const primerNombre = n => String(n || "").trim().split(/\s+/)[0];
