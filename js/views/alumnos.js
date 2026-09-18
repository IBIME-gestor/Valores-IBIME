/* Base de alumnos: se carga el Excel del colegio y queda listo para el pase de lista. */

import {
  db, doc, setDoc, writeBatch, collection, serverTimestamp, getDocs
} from "../firebase.js";
import { estado, cargarCatalogo, titulo, limpiarCacheAlumnos } from "../app.js";
import {
  $, $$, esc, avisar, confirmar, cargando, vacio, limpiaMatricula, norm,
  cargarSheetJS, exportarExcel, rebote
} from "../utils.js";

const COLUMNAS = ["MATRICULA", "NOMBRE ALUMNO", "PLANTEL", "NIVEL", "GRADO", "GRUPO", "CORREO ALUMNO"];
let pagina = 0, filtro = "";
const PORPAG = 50;

export async function render(cont) {
  titulo("Base de alumnos", "El archivo que sostiene todo el pase de lista");
  cont.innerHTML = cargando("Abriendo el catálogo…");
  await cargarCatalogo();
  pintar(cont);
}

function pintar(cont) {
  const total = estado.alumnos.length;

  cont.innerHTML = `
    <div class="cascada">
      <div class="caja">
        <div class="caja__cab">
          <div><h2>Cargar el listado</h2>
            <p>Archivo .xlsx, .xls o .csv con estas columnas, en cualquier orden: ${COLUMNAS.join(", ")}.</p></div>
          <button class="btn btn--linea btn--chico" id="b-plantilla">Descargar plantilla</button>
        </div>

        <div class="dropzona" id="zona">
          <h3>Suelta aquí tu archivo</h3>
          <p>O búscalo en tu equipo. Se lee en tu navegador; solo viajan los datos ya limpios.</p>
          <input type="file" id="archivo" accept=".xlsx,.xls,.csv" hidden>
          <button class="btn" id="b-elegir">Elegir archivo</button>
        </div>

        <div id="proceso" style="margin-top:18px"></div>
      </div>

      <div class="caja">
        <div class="caja__cab">
          <div><h2>${total.toLocaleString("es-MX")} alumnos en el catálogo</h2>
            <p id="resumen">${resumen()}</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn--suave btn--chico" id="b-exportar">Exportar catálogo</button>
            <button class="btn btn--linea btn--chico" id="b-refrescar">Refrescar</button>
          </div>
        </div>
        <div class="campo" style="max-width:360px;margin-bottom:14px">
          <label for="buscar">Buscar por matrícula o nombre</label>
          <input id="buscar" placeholder="Escribe y filtra" autocomplete="off">
        </div>
        <div id="tabla"></div>
      </div>
    </div>`;

  $("#b-elegir").addEventListener("click", () => $("#archivo").click());
  $("#archivo").addEventListener("change", e => { if (e.target.files[0]) procesar(e.target.files[0], cont); });
  $("#b-plantilla").addEventListener("click", plantilla);
  $("#b-exportar").addEventListener("click", exportarCatalogo);
  $("#b-refrescar").addEventListener("click", async () => {
    limpiarCacheAlumnos();
    await cargarCatalogo({ forzar: true });
    avisar("Catálogo actualizado.", "ok");
    pintar(cont);
  });
  $("#buscar").addEventListener("input", rebote(e => { filtro = e.target.value; pagina = 0; tabla(); }, 180));

  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault(); zona.classList.add("is-hover");
  }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault(); zona.classList.remove("is-hover");
  }));
  zona.addEventListener("drop", e => {
    const f = e.dataTransfer.files[0];
    if (f) procesar(f, cont);
  });

  tabla();
}

function resumen() {
  const p = new Set(estado.alumnos.map(a => a.plantel)).size;
  const n = new Set(estado.alumnos.map(a => a.nivel)).size;
  const g = new Set(estado.alumnos.map(a => `${a.plantel}|${a.nivel}|${a.grado}|${a.grupo}`)).size;
  return `${p} planteles · ${n} niveles · ${g} grupos`;
}

/* ---------- tabla ---------- */
function tabla() {
  const n = norm(filtro);
  const datos = n
    ? estado.alumnos.filter(a => norm(`${a.matricula} ${a.nombre}`).includes(n))
    : estado.alumnos;

  const cont = $("#tabla");
  if (!datos.length) {
    cont.innerHTML = estado.alumnos.length
      ? `<p style="color:var(--tinta-suave);font-size:.9rem;padding:18px 0">Nadie coincide con “${esc(filtro)}”.</p>`
      : vacio({ titulo: "El catálogo está vacío", texto: "Carga el Excel del colegio arriba y en segundos podrás pasar lista." });
    return;
  }

  const paginas = Math.ceil(datos.length / PORPAG);
  pagina = Math.min(pagina, paginas - 1);
  const trozo = datos.slice(pagina * PORPAG, (pagina + 1) * PORPAG);

  cont.innerHTML = `
    <div class="tablabox"><table>
      <thead><tr><th>Matrícula</th><th>Alumno</th><th>Plantel</th><th>Nivel</th><th>Grado</th><th>Grupo</th><th>Correo</th></tr></thead>
      <tbody>${trozo.map(a => `<tr>
        <td class="mat">${esc(a.matricula)}</td><td>${esc(a.nombre)}</td>
        <td>${esc(a.plantel)}</td><td>${esc(a.nivel)}</td>
        <td class="num">${esc(a.grado)}</td><td>${esc(a.grupo)}</td>
        <td style="color:var(--tinta-suave)">${esc(a.correo || "")}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    ${paginas > 1 ? `<div style="display:flex;gap:10px;align-items:center;justify-content:center;margin-top:14px">
      <button class="btn btn--suave btn--chico" id="b-ant" ${pagina === 0 ? "disabled" : ""}>Anterior</button>
      <span style="font-size:.85rem;color:var(--tinta-suave)">Página ${pagina + 1} de ${paginas}</span>
      <button class="btn btn--suave btn--chico" id="b-sig" ${pagina >= paginas - 1 ? "disabled" : ""}>Siguiente</button>
    </div>` : ""}`;

  $("#b-ant")?.addEventListener("click", () => { pagina--; tabla(); });
  $("#b-sig")?.addEventListener("click", () => { pagina++; tabla(); });
}

/* ---------- lectura del archivo ---------- */
async function procesar(archivo, cont) {
  const caja = $("#proceso");
  caja.innerHTML = cargando("Leyendo el archivo…");

  let filas;
  try {
    const XLSX = await cargarSheetJS();
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    filas = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: false });
  } catch (err) {
    caja.innerHTML = `<div class="aviso aviso--ambar">No se pudo leer el archivo: ${esc(err.message)}</div>`;
    return;
  }

  if (!filas.length) {
    caja.innerHTML = `<div class="aviso aviso--ambar">La primera hoja no tiene datos.</div>`;
    return;
  }

  const mapa = mapearColumnas(Object.keys(filas[0]));
  const faltan = COLUMNAS.filter(c => c !== "CORREO ALUMNO" && !mapa[c]);
  if (faltan.length) {
    caja.innerHTML = `<div class="aviso aviso--ambar">
      Faltan columnas en el archivo: <strong>${faltan.join(", ")}</strong>.
      Descarga la plantilla y vacía ahí tu información.</div>`;
    return;
  }

  const buenos = [], errores = [], vistos = new Set();
  filas.forEach((f, i) => {
    const matricula = limpiaMatricula(f[mapa.MATRICULA]);
    const nombre = String(f[mapa["NOMBRE ALUMNO"]] || "").trim();
    if (!matricula) return errores.push(`Fila ${i + 2}: sin matrícula`);
    if (!nombre) return errores.push(`Fila ${i + 2}: matrícula ${matricula} sin nombre`);
    if (vistos.has(matricula)) return errores.push(`Fila ${i + 2}: matrícula ${matricula} repetida`);
    vistos.add(matricula);
    buenos.push({
      matricula,
      nombre,
      plantel: String(f[mapa.PLANTEL] || "").trim(),
      nivel:   String(f[mapa.NIVEL] || "").trim(),
      grado:   String(f[mapa.GRADO] || "").trim(),
      grupo:   String(f[mapa.GRUPO] || "").trim().toUpperCase(),
      correo:  String(f[mapa["CORREO ALUMNO"]] || "").trim().toLowerCase()
    });
  });

  if (!buenos.length) {
    caja.innerHTML = `<div class="aviso aviso--ambar">Ninguna fila tiene matrícula y nombre válidos.</div>`;
    return;
  }

  caja.innerHTML = `
    <div class="aviso">
      <div>
        <strong>${buenos.length.toLocaleString("es-MX")} alumnos listos para cargar.</strong>
        ${errores.length ? `<br>${errores.length} fila${errores.length === 1 ? "" : "s"} se omitirán.` : ""}
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn--chico" id="b-sumar">Agregar y actualizar</button>
          <button class="btn btn--linea btn--chico" id="b-reemplazar">Reemplazar todo el catálogo</button>
        </div>
      </div>
    </div>
    ${errores.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-size:.86rem;color:var(--tinta-suave)">Ver filas omitidas</summary>
      <ul style="font-size:.84rem;color:var(--tinta-suave);margin-top:8px;padding-left:20px">
        ${errores.slice(0, 60).map(e => `<li>${esc(e)}</li>`).join("")}
      </ul></details>` : ""}`;

  $("#b-sumar").addEventListener("click", () => guardar(buenos, false, cont));
  $("#b-reemplazar").addEventListener("click", async () => {
    if (!await confirmar("¿Reemplazar todo el catálogo?",
      "Se borrarán los alumnos que no vengan en este archivo. Las asistencias ya registradas no se tocan.",
      "Sí, reemplazar")) return;
    guardar(buenos, true, cont);
  });
}

function mapearColumnas(cabeceras) {
  const mapa = {};
  for (const col of COLUMNAS) {
    const objetivo = norm(col);
    const hallada = cabeceras.find(h => {
      const n = norm(h);
      if (n === objetivo) return true;
      if (col === "NOMBRE ALUMNO") return n === "nombre" || n.startsWith("nombre");
      if (col === "CORREO ALUMNO") return n === "correo" || n.includes("mail");
      if (col === "MATRICULA") return n === "matricula" || n === "mat";
      return false;
    });
    if (hallada) mapa[col] = hallada;
  }
  return mapa;
}

async function guardar(lista, reemplazar, cont) {
  const caja = $("#proceso");
  caja.innerHTML = `<div class="aviso"><div style="flex:1">
      <strong id="paso">Guardando…</strong>
      <div class="barra" style="margin-top:10px"><i id="avance" style="width:0%"></i></div>
    </div></div>`;

  const paso = $("#paso"), avance = $("#avance");

  try {
    if (reemplazar) {
      paso.textContent = "Quitando el catálogo anterior…";
      const previos = await getDocs(collection(db, "alumnos"));
      const nuevos = new Set(lista.map(a => a.matricula));
      const sobran = previos.docs.filter(d => !nuevos.has(d.id));
      for (let i = 0; i < sobran.length; i += 450) {
        const lote = writeBatch(db);
        sobran.slice(i, i + 450).forEach(d => lote.delete(d.ref));
        await lote.commit();
      }
    }

    for (let i = 0; i < lista.length; i += 450) {
      const lote = writeBatch(db);
      lista.slice(i, i + 450).forEach(a =>
        lote.set(doc(db, "alumnos", a.matricula), a, { merge: true }));
      await lote.commit();
      const pct = Math.round(Math.min(100, ((i + 450) / lista.length) * 100));
      avance.style.width = pct + "%";
      paso.textContent = `Guardando… ${Math.min(i + 450, lista.length).toLocaleString("es-MX")} de ${lista.length.toLocaleString("es-MX")}`;
    }

    /* Marca la versión: los demás dispositivos refrescan su copia solos. */
    await setDoc(doc(db, "meta", "alumnos"), {
      version: Date.now(),
      total: lista.length,
      actualizado: serverTimestamp(),
      actualizadoPor: estado.perfil.nombre
    }, { merge: true });

    limpiarCacheAlumnos();
    await cargarCatalogo({ forzar: true });
    avisar(`${lista.length.toLocaleString("es-MX")} alumnos en el catálogo.`, "ok", 4000);
    pintar(cont);
  } catch (err) {
    console.error(err);
    caja.innerHTML = `<div class="aviso aviso--ambar">La carga se interrumpió: ${esc(err.message)}. Vuelve a intentarlo; lo ya guardado no se pierde.</div>`;
  }
}

/* ---------- plantilla y exportación ---------- */
async function plantilla() {
  await exportarExcel([{
    MATRICULA: "20240815", "NOMBRE ALUMNO": "PÉREZ LÓPEZ ANA SOFÍA",
    PLANTEL: "Norte", NIVEL: "Secundaria", GRADO: "2", GRUPO: "A",
    "CORREO ALUMNO": "ana.perez@ibime.edu.mx"
  }], "Plantilla-alumnos-IBIME", "Alumnos");
  avisar("Plantilla descargada.", "ok");
}

async function exportarCatalogo() {
  if (!estado.alumnos.length) return avisar("No hay alumnos que exportar.", "aviso");
  await exportarExcel(estado.alumnos.map(a => ({
    MATRICULA: a.matricula, "NOMBRE ALUMNO": a.nombre, PLANTEL: a.plantel,
    NIVEL: a.nivel, GRADO: a.grado, GRUPO: a.grupo, "CORREO ALUMNO": a.correo || ""
  })), "Catalogo-alumnos-IBIME", "Alumnos");
  avisar("Catálogo exportado.", "ok");
}
