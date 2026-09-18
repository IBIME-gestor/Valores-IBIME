# Valores IBIME

App web para registrar la asistencia de los alumnos a las actividades de los **12 principios institucionales**, uno por mes, y entregar a cada dirección el listado de quién merece puntos extra al día siguiente.

Corre **completamente en línea**: GitHub guarda el código, GitHub Pages lo publica y Firebase guarda los datos. No hay nada que instalar en ninguna computadora.

---

## Qué hace

| Módulo | Para qué sirve | Quién entra |
|---|---|---|
| **Panel** | El principio del mes, con su banner, y cómo va la participación | Todos |
| **Pase de lista** | Se teclea la matrícula, aparece el alumno y queda registrado al instante | Todos |
| **Consulta e informes** | Filtra por plantel, nivel, grado y grupo; vista previa, Excel, CSV o PDF | Todos |
| **Principios del año** | Define el valor de cada mes, sube el banner y crea las actividades | Administración |
| **Base de alumnos** | Carga el Excel del colegio | Administración |
| **Personas con acceso** | Sube o baja de rol, suspende accesos | Administración |

---

## Puesta en marcha (unos 20 minutos, todo desde el navegador)

### 1. Sube el proyecto a GitHub

1. Entra a [github.com/new](https://github.com/new) y crea un repositorio, por ejemplo `valores-ibime`. Márcalo **Public**.
2. En el repositorio recién creado, usa **Add file → Upload files** y arrastra **todo** el contenido de esta carpeta, respetando los subfolders (`assets/`, `css/`, `js/`, `js/views/`).
3. Presiona **Commit changes**.

### 2. Crea el proyecto en Firebase

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta institucional → **Crear un proyecto**. Llámalo `valores-ibime`. Google Analytics no hace falta.
2. En el menú lateral, **Compilación → Firestore Database → Crear base de datos**. Elige modo **producción** y la región `nam5` o `us-central`.
3. **Compilación → Authentication → Comenzar → Google → Habilitar**. Pon un correo de soporte y guarda.
4. Arriba a la izquierda, ⚙ **Configuración del proyecto → Tus apps → ícono `</>`** (web). Registra la app con el apodo `Valores IBIME`. Firebase te muestra un bloque `firebaseConfig`: **cópialo**, lo necesitas en el paso siguiente.

### 3. Pega tus datos en `js/config.js`

En GitHub abre `js/config.js` → botón del lápiz ✏ → reemplaza:

- `firebaseConfig` con el bloque que copiaste.
- `DOMINIO_INSTITUCIONAL` con el dominio de los correos del colegio, por ejemplo `"ibime.edu.mx"`.
- `ADMINS_SEMILLA` con **tu correo** (puedes poner varios).
- Si quieres, los nombres de los 12 principios. También se editan luego desde la app.

**Commit changes.**

### 4. Publica las reglas de seguridad

1. Abre `firestore.rules` en GitHub y cambia, en las dos primeras funciones, el dominio y la lista de correos de administración. Deben ser **exactamente los mismos** que pusiste en `config.js`. Commit.
2. En Firebase: **Firestore Database → pestaña Reglas** → borra lo que haya, pega el contenido completo del archivo y presiona **Publicar**.

### 5. Enciende GitHub Pages

En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, carpeta `/ (root)` → Save**.

En uno o dos minutos GitHub te da la dirección, del estilo `https://tuusuario.github.io/valores-ibime/`.

### 6. Autoriza esa dirección en Firebase

En Firebase: **Authentication → Settings → Dominios autorizados → Agregar dominio** y escribe `tuusuario.github.io`.

Sin este paso el botón de entrar marcará error de dominio no autorizado.

### 7. Entra y carga tus alumnos

Abre la dirección, entra con tu correo institucional (llegarás como administrador porque tu correo está en la lista) y ve a **Base de alumnos → Elegir archivo**.

El Excel debe traer estas columnas, en cualquier orden:

```
MATRICULA | NOMBRE ALUMNO | PLANTEL | NIVEL | GRADO | GRUPO | CORREO ALUMNO
```

En el repositorio viene `plantilla-alumnos.xlsx` con el formato exacto. También puedes descargarla desde la app.

---

## Cómo entra el resto del personal

No los das de alta. Cualquier persona con correo del dominio institucional abre la dirección, presiona **Entrar con mi cuenta institucional** y queda registrada sola con el rol **Colaborador IBIME**, que puede pasar lista y consultar informes.

Si alguien necesita más permisos, lo subes desde **Personas con acceso**. Si alguien deja el colegio, ahí mismo lo suspendes.

---

## El día de la actividad

1. Abre **Pase de lista** y elige la actividad.
2. Teclea o escanea la matrícula. Con el registro automático encendido, el alumno queda registrado en cuanto el sistema reconoce la matrícula completa: suena un tono corto, vibra el teléfono y el cursor vuelve a quedar listo para el siguiente.
3. Si el internet se cae, sigue funcionando: los registros se guardan en el dispositivo y se envían solos al recuperar la señal.
4. Varias personas pueden pasar lista al mismo tiempo en distintas puertas; todas ven la misma cuenta en vivo.

Al día siguiente, en **Consulta e informes**, filtra por plantel o por grupo, revisa la vista previa y descarga el Excel para el director de nivel.

---

## Detalles técnicos

- Sin compilación ni dependencias instaladas: HTML, CSS y JavaScript con módulos nativos. Se edita en GitHub y se publica solo.
- Firebase SDK 10.12.5 y SheetJS por CDN. SheetJS solo se descarga cuando alguien abre o descarga un Excel.
- El catálogo de alumnos se guarda en el dispositivo con una marca de versión: la búsqueda por matrícula no toca la red. Cuando la administración sube un archivo nuevo, todos los dispositivos refrescan su copia solos.
- Los banners se reescalan y comprimen en el navegador antes de guardarse, así el proyecto no necesita Firebase Storage ni plan de pago.
- Probado en Chrome, Safari (incluido iPhone, con su bloqueo de ventanas emergentes resuelto por redirección), Edge y Firefox.
- Respeta `prefers-reduced-motion`, tiene foco visible en teclado y hoja de impresión propia para los informes.

### Estructura

```
index.html                 pantalla de acceso y armazón
manifest.webmanifest       para instalarla como app en el teléfono
firestore.rules            seguridad — se pega en la consola de Firebase
plantilla-alumnos.xlsx     formato del listado
css/styles.css
assets/                    logo, escudo e iconos
js/config.js               ÚNICO archivo que necesitas editar
js/firebase.js             conexión
js/app.js                  sesión, roles, catálogo, navegación
js/utils.js                avisos, diálogos, exportación, imágenes
js/views/                  las seis pantallas
```

### Colecciones en Firestore

| Colección | Contenido |
|---|---|
| `usuarios/{uid}` | quién entró, su rol y si está activo |
| `alumnos/{matricula}` | el catálogo del colegio |
| `principios/{año_mes}` | el valor del mes, su lema y su banner |
| `actividades/{id}` | cada evento donde se pasa lista |
| `asistencias/{actividad__matricula}` | un registro por alumno y actividad |
| `meta/alumnos` | versión del catálogo, para refrescar los dispositivos |

El identificador de cada asistencia impide, por diseño, que un alumno quede registrado dos veces en la misma actividad.

---

## Si algo falla

| Qué ves | Qué hacer |
|---|---|
| «Este sitio todavía no está autorizado» | Falta el paso 6: agrega tu dominio de GitHub Pages en Authentication → Settings |
| «No se pudo abrir tu perfil» | Las reglas no están publicadas o el dominio dentro de `firestore.rules` no coincide con el de los correos |
| Entras y no ves los módulos de administración | Tu correo no está en `ADMINS_SEMILLA` **y** en `ADMINS()` de las reglas, o falta un commit |
| El Excel no carga | Revisa que la primera fila tenga los encabezados y que la información esté en la primera hoja |
| La app no cambia después de editar en GitHub | GitHub Pages tarda un minuto; luego recarga con Ctrl+F5 o Cmd+Shift+R |
