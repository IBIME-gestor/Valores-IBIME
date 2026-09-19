/* Piezas reutilizables: avisos, diálogos, exportación, imágenes. */

import { AJUSTES, MESES, CORREO } from "./config.js";

/* ---------- atajos ---------- */
export const $  = (s, ctx = document) => ctx.querySelector(s);
export const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const nombreMes = n => MESES[(Number(n) || 1) - 1] || "";

/* Normaliza para buscar sin acentos ni mayúsculas. */
export const norm = s => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* Las matrículas se comparan sin espacios ni guiones. */
export const limpiaMatricula = s => String(s ?? "").replace(/[\s\-_.]/g, "").toUpperCase();

export function fechaLarga(d) {
  const f = d instanceof Date ? d : new Date(d);
  return f.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function fechaCorta(d) {
  const f = d instanceof Date ? d : new Date(d);
  return f.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function hora(d) {
  const f = d instanceof Date ? d : new Date(d);
  return f.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
export const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // aaaa-mm-dd local

/* ---------- avisos ---------- */
export function avisar(texto, tipo = "", ms = 3200) {
  const zona = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast" + (tipo ? ` toast--${tipo}` : "");
  t.textContent = texto;
  zona.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s ease";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 260);
  }, ms);
}

/* ---------- diálogo ---------- */
export function abrirModal({ titulo, sub = "", cuerpo, acciones = [], alAbrir }) {
  const dlg = $("#modal");
  dlg.innerHTML = `
    <div class="modal__cab"><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
    <div class="modal__cuerpo">${cuerpo}</div>
    <div class="modal__pie">
      ${acciones.map((a, i) =>
        `<button class="btn ${a.clase || "btn--suave"}" data-ac="${i}">${esc(a.texto)}</button>`).join("")}
    </div>`;
  dlg.querySelectorAll("[data-ac]").forEach(b => {
    b.addEventListener("click", async () => {
      const ac = acciones[+b.dataset.ac];
      if (!ac.fn) return dlg.close();
      b.disabled = true;
      try { if (await ac.fn(dlg) !== false) dlg.close(); }
      finally { b.disabled = false; }
    });
  });
  if (!dlg.open) dlg.showModal();
  alAbrir?.(dlg);
  return dlg;
}
export const cerrarModal = () => $("#modal").close();

export function confirmar(titulo, sub, textoOk = "Sí, continuar") {
  return new Promise(res => {
    let resuelto = false;
    const responde = v => { if (!resuelto) { resuelto = true; res(v); } };
    const dlg = abrirModal({
      titulo, sub, cuerpo: "",
      acciones: [
        { texto: "Cancelar", fn: () => responde(false) },
        { texto: textoOk, clase: "btn", fn: () => responde(true) }
      ]
    });
    dlg.addEventListener("close", () => responde(false), { once: true });
  });
}

/* ---------- carga de SheetJS solo cuando hace falta ---------- */
let sheetjs = null;
export async function cargarSheetJS() {
  if (sheetjs) return sheetjs;
  await new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = ok;
    s.onerror = () => mal(new Error("No se pudo cargar el lector de Excel. Revisa la conexión."));
    document.head.appendChild(s);
  });
  sheetjs = window.XLSX;
  return sheetjs;
}

/* ---------- exportar ---------- */
export async function exportarExcel(filas, nombreArchivo, nombreHoja = "Datos") {
  const XLSX = await cargarSheetJS();
  const hoja = XLSX.utils.json_to_sheet(filas);
  const anchos = Object.keys(filas[0] || {}).map(k => ({
    wch: Math.min(42, Math.max(k.length + 2, ...filas.slice(0, 200).map(f => String(f[k] ?? "").length + 2)))
  }));
  hoja["!cols"] = anchos;
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja.slice(0, 30));
  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
}

export function exportarCSV(filas, nombreArchivo) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const linea = v => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [cols.join(","), ...filas.map(f => cols.map(c => linea(f[c])).join(","))].join("\r\n");
  descargar(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${nombreArchivo}.csv`);
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- banner: reescalar y comprimir en el navegador ---------- */
export async function imagenAdataURL(archivo) {
  if (!archivo.type.startsWith("image/")) throw new Error("Ese archivo no es una imagen.");
  const bitmap = await crearBitmap(archivo);
  const max = AJUSTES.maxAnchoBanner;
  const escala = Math.min(1, max / bitmap.width);
  const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = w; lienzo.height = h;
  lienzo.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const data = lienzo.toDataURL("image/jpeg", AJUSTES.calidadBanner);
  if (data.length > 900_000) throw new Error("La imagen sigue pesando demasiado. Usa una de menor tamaño.");
  return data;
}

/* ---------- plantillas de correo: leer archivo .html como texto ---------- */
export function archivoATexto(archivo) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || ""));
    r.onerror = () => mal(new Error("No se pudo leer el archivo."));
    r.readAsText(archivo, "UTF-8");
  });
}

/* Reemplaza {{MARCADOR}} por el dato correspondiente del alumno/actividad. */
export function personalizar(html, datos = {}) {
  const mapa = {
    NOMBRE_ALUMNO: datos.nombre, MATRICULA: datos.matricula,
    PLANTEL: datos.plantel, NIVEL: datos.nivel,
    GRADO: datos.grado, GRUPO: datos.grupo,
    ACTIVIDAD: datos.actividadTitulo, PRINCIPIO: datos.principioTitulo,
    FECHA: datos.fecha, PUNTOS: datos.puntos
  };
  let out = String(html || "");
  for (const [clave, valor] of Object.entries(mapa)) {
    out = out.replaceAll(`{{${clave}}}`, esc(valor ?? ""));
  }
  return out;
}

/* Manda un correo a través del Apps Script del colegio. No detiene la UI si falla. */
export async function enviarCorreo({ to, subject, html }) {
  if (!to || !CORREO.urlAppsScript || CORREO.urlAppsScript.includes("PON_AQUI")) return;
  try {
    await fetch(CORREO.urlAppsScript, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },   // evita el preflight de CORS
      body: JSON.stringify({ clave: CORREO.clave, to, subject, html })
    });
  } catch (err) {
    console.error("No se pudo mandar el correo:", err);
  }
}

function crearBitmap(archivo) {
  if (window.createImageBitmap) return createImageBitmap(archivo);
  return new Promise((ok, mal) => {           // camino alterno para Safari viejo
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("No se pudo leer la imagen."));
    img.src = URL.createObjectURL(archivo);
  });
}

/* ---------- misceláneos ---------- */
export function rebote(fn, ms = 180) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function vacio({ titulo, texto, boton }) {
  return `<div class="vacio">
    <img src="assets/escudo-ibime.png" alt="">
    <h3>${esc(titulo)}</h3>
    <p>${esc(texto)}</p>
    ${boton ? `<button class="btn" id="${boton.id}">${esc(boton.texto)}</button>` : ""}
  </div>`;
}

export const cargando = (t = "Cargando…") => `<div class="cargando"><i class="spin"></i>${esc(t)}</div>`;

/* Un pitido corto para confirmar el registro sin mirar la pantalla. */
let ctxAudio = null;
export function pitido(exito = true) {
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === "suspended") ctxAudio.resume();
    const o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
    o.connect(g); g.connect(ctxAudio.destination);
    o.frequency.value = exito ? 880 : 240;
    o.type = "sine";
    g.gain.setValueAtTime(.0001, ctxAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(.16, ctxAudio.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.0001, ctxAudio.currentTime + .18);
    o.start(); o.stop(ctxAudio.currentTime + .2);
  } catch { /* sin sonido, sin drama */ }
}

export function vibrar(ms = 18) { navigator.vibrate?.(ms); }
