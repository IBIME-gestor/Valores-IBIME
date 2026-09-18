/* Quién puede entrar y con qué rol. Nadie se da de alta a mano:
   basta con que entre una vez con su correo institucional. */

import { db, getDocs, collection, doc, updateDoc } from "../firebase.js";
import { DOMINIO_INSTITUCIONAL } from "../config.js";
import { estado, titulo } from "../app.js";
import { $, $$, esc, avisar, confirmar, cargando, fechaCorta } from "../utils.js";

let gente = [];

export async function render(cont) {
  titulo("Personas con acceso", "Se registran solas al entrar con su correo del colegio");
  cont.innerHTML = cargando("Revisando quién ha entrado…");

  const snap = await getDocs(collection(db, "usuarios"));
  gente = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  pintar(cont);
}

function pintar(cont) {
  const admins = gente.filter(g => g.rol === "admin").length;

  cont.innerHTML = `
    <div class="cascada">
      <div class="aviso">
        <div>
          <strong>Así funciona el acceso.</strong>
          Cualquier persona con correo${DOMINIO_INSTITUCIONAL ? ` <strong>@${esc(DOMINIO_INSTITUCIONAL)}</strong>` : " de Google"}
          entra sin que tú la registres, y llega con el rol Colaborador IBIME: puede pasar lista y consultar informes.
          Desde aquí decides quién sube a administrador o a quién suspendes.
        </div>
      </div>

      <div class="rejilla rejilla--3">
        <div class="dato"><b>${gente.length}</b><span>personas han entrado</span></div>
        <div class="dato dato--rojo"><b>${admins}</b><span>con permisos de administración</span></div>
        <div class="dato"><b>${gente.filter(g => g.activo === false).length}</b><span>accesos suspendidos</span></div>
      </div>

      <div class="caja">
        <div class="caja__cab"><div><h2>Listado</h2><p>El rol se aplica la próxima vez que la persona recargue la app.</p></div></div>
        <div class="tablabox"><table>
          <thead><tr><th>Persona</th><th>Correo</th><th>Rol</th><th>Último acceso</th><th></th></tr></thead>
          <tbody>${gente.map(fila).join("")}</tbody>
        </table></div>
      </div>
    </div>`;

  $$("[data-rol]").forEach(b => b.addEventListener("click", () => cambiarRol(b.dataset.rol, cont)));
  $$("[data-activo]").forEach(b => b.addEventListener("click", () => cambiarActivo(b.dataset.activo, cont)));
}

function fila(g) {
  const yo = g.id === estado.usuario.uid;
  const admin = g.rol === "admin";
  const suspendido = g.activo === false;
  const ultimo = g.ultimoAcceso?.seconds ? fechaCorta(new Date(g.ultimoAcceso.seconds * 1000)) : "—";

  return `<tr>
    <td><strong>${esc(g.nombre || "—")}</strong>${yo ? ` <span class="pill">tú</span>` : ""}</td>
    <td style="color:var(--tinta-suave)">${esc(g.correo)}</td>
    <td>${admin ? `<span class="pill pill--rojo">Administrador</span>` : `<span class="pill">Colaborador IBIME</span>`}
        ${suspendido ? ` <span class="pill pill--alerta">Suspendido</span>` : ""}</td>
    <td class="num">${ultimo}</td>
    <td style="white-space:nowrap">
      ${yo ? "" : `
        <button class="btn btn--linea btn--chico" data-rol="${g.id}">${admin ? "Bajar a colaborador" : "Hacer administrador"}</button>
        <button class="btn btn--linea btn--chico" data-activo="${g.id}">${suspendido ? "Reactivar" : "Suspender"}</button>`}
    </td>
  </tr>`;
}

async function cambiarRol(id, cont) {
  const g = gente.find(x => x.id === id);
  const sube = g.rol !== "admin";
  const ok = await confirmar(
    sube ? `¿Hacer administrador a ${g.nombre}?` : `¿Bajar a ${g.nombre} a colaborador?`,
    sube ? "Podrá editar los principios, cargar la base de alumnos y cambiar roles."
         : "Conservará el pase de lista y la consulta de informes.",
    sube ? "Sí, hacerlo administrador" : "Sí, bajarlo");
  if (!ok) return;

  try {
    await updateDoc(doc(db, "usuarios", id), { rol: sube ? "admin" : "colaborador" });
    g.rol = sube ? "admin" : "colaborador";
    avisar("Rol actualizado.", "ok");
    pintar(cont);
  } catch { avisar("No se pudo cambiar el rol. Revisa las reglas de Firestore.", "mal"); }
}

async function cambiarActivo(id, cont) {
  const g = gente.find(x => x.id === id);
  const suspender = g.activo !== false;
  const ok = await confirmar(
    suspender ? `¿Suspender el acceso de ${g.nombre}?` : `¿Reactivar a ${g.nombre}?`,
    suspender ? "Dejará de poder entrar hasta que lo reactives." : "Volverá a entrar con su rol actual.",
    suspender ? "Sí, suspender" : "Sí, reactivar");
  if (!ok) return;

  try {
    await updateDoc(doc(db, "usuarios", id), { activo: !suspender });
    g.activo = !suspender;
    avisar(suspender ? "Acceso suspendido." : "Acceso reactivado.", "ok");
    pintar(cont);
  } catch { avisar("No se pudo actualizar el acceso.", "mal"); }
}
