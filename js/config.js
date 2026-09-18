/* ============================================================
   CONFIGURACIÓN — este es el único archivo que necesitas editar
   para poner la app en marcha. Todo se edita desde GitHub, en
   el navegador, sin instalar nada.
   ============================================================ */

/* 1) Pega aquí lo que te da Firebase en:
      Consola → ⚙ Configuración del proyecto → Tus apps → App web */
export const firebaseConfig = {
  apiKey:            "PEGA_AQUI_TU_API_KEY",
  authDomain:        "TU-PROYECTO.firebaseapp.com",
  projectId:         "TU-PROYECTO",
  storageBucket:     "TU-PROYECTO.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

/* 2) Dominio institucional. Solo los correos de este dominio pueden entrar.
      Déjalo vacío ("") si quieres permitir cualquier cuenta de Google. */
export const DOMINIO_INSTITUCIONAL = "ibime.edu.mx";

/* 3) Correos que entran como administradores desde el primer día.
      Pon aquí el tuyo. Debe coincidir, letra por letra, con la lista
      que escribas en firestore.rules. */
export const ADMINS_SEMILLA = [
  "director@ibime.edu.mx"
];

/* 4) Los doce principios, uno por mes. Puedes cambiarlos aquí antes de
      publicar, o editarlos después desde la propia app. */
export const PRINCIPIOS_BASE = [
  { mes: 1,  titulo: "Identidad",      lema: "Sé quien eres, con orgullo." },
  { mes: 2,  titulo: "Respeto",        lema: "El otro también importa." },
  { mes: 3,  titulo: "Responsabilidad",lema: "Lo que prometo, lo cumplo." },
  { mes: 4,  titulo: "Honestidad",     lema: "Verdad aunque cueste." },
  { mes: 5,  titulo: "Gratitud",       lema: "Reconocer lo recibido." },
  { mes: 6,  titulo: "Solidaridad",    lema: "Nadie se queda atrás." },
  { mes: 7,  titulo: "Perseverancia",  lema: "Seguir cuando cuesta." },
  { mes: 8,  titulo: "Disciplina",     lema: "El hábito construye." },
  { mes: 9,  titulo: "Empatía",        lema: "Sentir con los demás." },
  { mes: 10, titulo: "Servicio",       lema: "Dar sin esperar." },
  { mes: 11, titulo: "Justicia",       lema: "A cada quien lo suyo." },
  { mes: 12, titulo: "Esperanza",      lema: "Mañana se construye hoy." }
];

/* 5) Ajustes finos (rara vez hace falta tocarlos) */
export const AJUSTES = {
  puntosPorAsistencia: 1,        // puntos extra sugeridos por actividad
  maxAnchoBanner: 1400,          // px a los que se reescala el banner antes de guardar
  calidadBanner: 0.82,           // compresión JPEG del banner
  cacheAlumnosHoras: 12          // horas que el catálogo vive en el dispositivo
};

export const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
