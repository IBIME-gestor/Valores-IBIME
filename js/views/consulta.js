/* Consulta e informes: filtrar, ver y entregar a dirección. */

import { db, getDocs, collection, query, where } from "../firebase.js";
import { MESES } from "../config.js";
import { titulo } from "../app.js";
import {
  $, $$, esc, avisar, cargando, vacio, nombreMes, fechaCorta,
  exportarExcel, exportarCSV
} from "../utils.js";

let filas = [];        // asistencias del periodo elegido
let actividades = [];
let vista = "alumnos"; // alumnos | grupos

export async function render(cont) {
  titulo("Consulta e informes", "Filtra, revisa y entrega a cada dirección");

  const hoy = new Date();
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

  cont.innerHTML = `
    <div class="cascada">
      <div class="caja no-print">
        <div class="caja__cab">
          <div><h2>Qué quieres ver</h2><p>Elige el periodo y afina con los filtros.</p></div>
        </div>
        <div class="filtros">
          <div class="campo"><label for="f-periodo">Mes</label>
            <input id="f-periodo" type="month" value="${periodo}"></div>
          <div class="campo"><label for="f-act">Actividad</label>
            <select id="f-act"><option value="">Todas las del mes</option></select></div>
          <div class="campo"><label for="f-plantel">Plantel</label>
            <select id="f-plantel"><option value="">Todos</option></select></div>
          <div class="campo"><label for="f-nivel">Nivel</label>
            <select id="f-nivel"><option value="">Todos</option></select></div>
          <div class="campo"><label for="f-grado">Grado</label>
            <select id="f-grado"><option value="">Todos</option></select></div>
          <div class="campo"><label for="f-grupo">Grupo</label>
            <select id="f-grupo"><option value="">Todos</option></select></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
          <button class="btn" id="b-ver">Ver resultados</button>
          <button class="btn btn--suave" id="b-excel">Descargar Excel</button>
          <button class="btn btn--suave" id="b-csv">Descargar CSV</button>
          <button class="btn btn--linea" id="b-print">Imprimir o guardar PDF</button>
          <div style="flex:1"></div>
          <button class="btn btn--linea btn--chico" id="b-vista">Ver por grupo</button>
        </div>
      </div>

      <div id="salida"></div>
    </div>`;

  $("#b-ver").addEventListener("click", consultar);
  $("#b-excel").addEventListener("click", bajarExcel);
  $("#b-csv").addEventListener("click", bajarCSV);
  $("#b-print").addEventListener("click", () => window.print());
  $("#b-vista").addEventListener("click", () => {
    vista = vista === "alumnos" ? "grupos" : "alumnos";
    $("#b-vista").textContent = vista === "alumnos" ? "Ver por grupo" : "Ver alumno por alumno";
    pintar();
  });
  $("#f-periodo").addEventListener("change", consultar);
  ["f-act", "f-plantel", "f-nivel", "f-grado", "f-grupo"].forEach(id =>
    $("#" + id).addEventListener("change", pintar));

  await consultar();
}

async function consultar() {
  const periodo = $("#f-periodo").value;
  if (!periodo) return;
  $("#salida").innerHTML = cargando("Reuniendo los registros…");

  try {
    const [asis, acts] = await Promise.all([
      getDocs(query(collection(db, "asistencias"), where("periodo", "==", periodo))),
      getDocs(query(collection(db, "actividades"), where("periodo", "==", periodo)))
    ]);
    filas = asis.docs.map(d => ({ id: d.id, ...d.data() }));
    actividades = acts.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    $("#salida").innerHTML = `<div class="caja"><p>No se pudieron traer los registros: ${esc(err.message)}</p></div>`;
    return;
  }

  llenar("#f-act", actividades.map(a => [a.id, `${a.fecha} · ${a.titulo}`]), "Todas las del mes");
  llenar("#f-plantel", unicos("plantel").map(v => [v, v]), "Todos");
  llenar("#f-nivel",   unicos("nivel").map(v => [v, v]),   "Todos");
  llenar("#f-grado",   unicos("grado").map(v => [v, v]),   "Todos");
  llenar("#f-grupo",   unicos("grupo").map(v => [v, v]),   "Todos");

  pintar();
}

const unicos = campo => [...new Set(filas.map(f => f[campo]).filter(Boolean))].sort();

function llenar(sel, pares, primero) {
  const el = $(sel), previo = el.value;
  el.innerHTML = `<option value="">${primero}</option>` +
    pares.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  if ([...el.options].some(o => o.value === previo)) el.value = previo;
}

function filtradas() {
  const f = {
    actividadId: $("#f-act").value,
    plantel: $("#f-plantel").value,
    nivel: $("#f-nivel").value,
    grado: $("#f-grado").value,
    grupo: $("#f-grupo").value
  };
  return filas.filter(r => Object.entries(f).every(([k, v]) => !v || String(r[k]) === v))
              .sort((a, b) => (a.plantel + a.nivel + a.grado + a.grupo + a.nombre)
                    .localeCompare(b.plantel + b.nivel + b.grado + b.grupo + b.nombre, "es"));
}

function pintar() {
  const datos = filtradas();
  const salida = $("#salida");
  const periodo = $("#f-periodo").value;
  const [y, m] = periodo.split("-");

  if (!datos.length) {
    salida.innerHTML = `<div class="caja">${vacio({
      titulo: "Sin registros con esos filtros",
      texto: "Prueba con otro mes o quita algún filtro. Si la actividad acaba de ocurrir, vuelve a consultar."
    })}</div>`;
    return;
  }

  const alumnosUnicos = new Set(datos.map(d => d.matricula)).size;
  const puntos = datos.reduce((s, d) => s + (Number(d.puntos) || 0), 0);
  const gruposTocados = new Set(datos.map(d => `${d.plantel}|${d.nivel}|${d.grado}|${d.grupo}`)).size;

  salida.innerHTML = `
    <div class="rejilla rejilla--4" style="margin-bottom:18px">
      <div class="dato"><b>${datos.length}</b><span>asistencias registradas</span></div>
      <div class="dato dato--rojo"><b>${alumnosUnicos}</b><span>alumnos distintos</span></div>
      <div class="dato"><b>${gruposTocados}</b><span>grupos involucrados</span></div>
      <div class="dato"><b>${puntos % 1 ? puntos.toFixed(1) : puntos}</b><span>puntos extra por otorgar</span></div>
    </div>

    <div class="caja">
      <div class="caja__cab">
        <div>
          <h2>Informe de ${esc(nombreMes(+m))} ${esc(y)}</h2>
          <p>${esc(tituloFiltros())}</p>
        </div>
      </div>
      ${vista === "alumnos" ? tablaAlumnos(datos) : tablaGrupos(datos)}
    </div>`;
}

function tituloFiltros() {
  const partes = [];
  const t = (sel, etq) => { const e = $(sel); if (e.value) partes.push(`${etq}: ${e.options[e.selectedIndex].text}`); };
  t("#f-act", "Actividad"); t("#f-plantel", "Plantel"); t("#f-nivel", "Nivel");
  t("#f-grado", "Grado"); t("#f-grupo", "Grupo");
  return partes.length ? partes.join(" · ") : "Todos los planteles, niveles, grados y grupos";
}

function tablaAlumnos(datos) {
  return `<div class="tablabox"><table>
    <thead><tr>
      <th>Matrícula</th><th>Alumno</th><th>Plantel</th><th>Nivel</th>
      <th>Grado</th><th>Grupo</th><th>Actividad</th><th>Fecha</th><th>Puntos</th>
    </tr></thead>
    <tbody>${datos.map(d => `<tr>
      <td class="mat">${esc(d.matricula)}</td>
      <td>${esc(d.nombre)}</td>
      <td>${esc(d.plantel)}</td>
      <td>${esc(d.nivel)}</td>
      <td class="num">${esc(d.grado)}</td>
      <td>${esc(d.grupo)}</td>
      <td>${esc(d.actividadTitulo)}</td>
      <td class="num">${esc(fechaCorta(d.fecha + "T12:00:00"))}</td>
      <td class="num">${esc(d.puntos ?? 1)}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function tablaGrupos(datos) {
  const mapa = new Map();
  for (const d of datos) {
    const llave = `${d.plantel}|${d.nivel}|${d.grado}|${d.grupo}`;
    if (!mapa.has(llave)) mapa.set(llave, { ...d, alumnos: new Map(), registros: 0, puntos: 0 });
    const g = mapa.get(llave);
    g.registros++; g.puntos += Number(d.puntos) || 0;
    const prev = g.alumnos.get(d.matricula) || { nombre: d.nombre, veces: 0, puntos: 0 };
    prev.veces++; prev.puntos += Number(d.puntos) || 0;
    g.alumnos.set(d.matricula, prev);
  }

  return [...mapa.values()].map(g => `
    <section style="margin-bottom:26px">
      <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="font-size:1rem;color:var(--navy)">${esc(g.plantel)} · ${esc(g.nivel)} · ${esc(g.grado)}° ${esc(g.grupo)}</h3>
        <span class="pill pill--ok">${g.alumnos.size} alumnos</span>
        <span class="pill">${g.puntos % 1 ? g.puntos.toFixed(1) : g.puntos} puntos</span>
      </div>
      <div class="tablabox"><table>
        <thead><tr><th>Matrícula</th><th>Alumno</th><th>Actividades</th><th>Puntos extra</th></tr></thead>
        <tbody>${[...g.alumnos.entries()]
          .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"))
          .map(([mat, a]) => `<tr>
            <td class="mat">${esc(mat)}</td><td>${esc(a.nombre)}</td>
            <td class="num">${a.veces}</td><td class="num">${a.puntos % 1 ? a.puntos.toFixed(1) : a.puntos}</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </section>`).join("");
}

/* ---------- descargas ---------- */
function paraArchivo() {
  return filtradas().map(d => ({
    MATRICULA: d.matricula,
    "NOMBRE ALUMNO": d.nombre,
    PLANTEL: d.plantel,
    NIVEL: d.nivel,
    GRADO: d.grado,
    GRUPO: d.grupo,
    "CORREO ALUMNO": d.correo || "",
    PRINCIPIO: d.principioTitulo || "",
    ACTIVIDAD: d.actividadTitulo,
    FECHA: d.fecha,
    "PUNTOS EXTRA": d.puntos ?? 1,
    "REGISTRADO POR": d.registradoPorNombre || ""
  }));
}

const nombreArchivo = () => {
  const [y, m] = $("#f-periodo").value.split("-");
  const extra = [$("#f-plantel").value, $("#f-nivel").value,
    $("#f-grado").value && $("#f-grado").value + "°", $("#f-grupo").value]
    .filter(Boolean).join("-").replace(/\s+/g, "");
  return `Valores-IBIME_${MESES[+m - 1]}-${y}${extra ? "_" + extra : ""}`;
};

async function bajarExcel() {
  const d = paraArchivo();
  if (!d.length) return avisar("No hay nada que descargar con esos filtros.", "aviso");
  try { await exportarExcel(d, nombreArchivo(), "Asistencias"); avisar("Excel descargado.", "ok"); }
  catch (e) { avisar(e.message, "mal"); }
}

function bajarCSV() {
  const d = paraArchivo();
  if (!d.length) return avisar("No hay nada que descargar con esos filtros.", "aviso");
  exportarCSV(d, nombreArchivo());
  avisar("CSV descargado.", "ok");
}
