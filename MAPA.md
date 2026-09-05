# MAPA DEL PROYECTO — Red Aquí Estamos

> Índice completo de funcionalidades, archivos y contratos entre frontend y backend.
>
> Vivía FUERA de los dos repos, en la carpeta padre, para no ensuciar ningún árbol de
> trabajo. El precio era que no viajaba con el código: no estaba versionado en ningún
> sitio, se quedaba atrás sin que nada lo delatara —llegó a declarar 31 claves cuando
> había 32, y una numeración de pasos que el código ya había cambiado— y desaparecía con
> la carpeta. Ahora vive aquí, en el backend, porque es donde están las reglas que más
> caro cuesta romper: las máquinas de estados, las migraciones, los barridos, los
> permisos y las claves de Parametrización.
>
> Cubre los DOS repos. Si tocas el frontend, este sigue siendo el mapa.

| | |
|---|---|
| **Backend** | `aquiestamos-back` · Node 20 + Express 4 + Prisma 6 + PostgreSQL · Railway |
| **Frontend** | `aquiestamos-front` · Next.js 16 + React 19 + TypeScript · Vercel |
| **Almacenamiento** | Supabase Storage (bucket privado `documentos`) |
| **Correo** | Brevo (API HTTPS; SMTP como alternativa) |
| **Videollamada** | Jitsi (`meet.jit.si` por defecto) |
| **Zona horaria** | America/Bogota (`src/services/timezone.service.js`) |

---

## 🛡️ Riesgos resueltos (27-ago-2026)

Los cuatro de la lista original, más dos que salieron al tirar del hilo. **Todo desplegado
y verificado en producción.** Lo que queda por hacer está en el artefacto
«Prioridades de Aquí Estamos».

### 0. Cualquiera en internet veía quién estaba en terapia → CERRADO

El peor de todos, y no estaba en ninguna lista. `GET /api/meetings/live` no pasaba por
`authenticate` y el proxy del frontend lo reenviaba sin sesión: devolvía el nombre completo
de la persona acompañada, el del profesional y el de cada participante conectado.
Comprobado desde fuera, sin credenciales: respondía `200`.

- **`meetingTelemetry.routes.js`** — `/live` exige `authenticate` + `authorize('agenda:leer')`.
  El resto del router se revisó endpoint por endpoint: `/info`, `/join`, `/ping`, `/leave` y
  `/report-error` siguen públicos —quien entra a una sala no tiene cuenta— pero con límite
  de peticiones, en dos ventanas distintas porque el ping se repite cada 25 s por participante.
- **`app/api/meetings/[...ruta]/route.ts`** — reenvía la IP del cliente. Sin eso, ese límite
  se habría repartido entre todos los usuarios del país a la vez.
- **`test/telemetria.test.js`** — 9 pruebas nuevas. Comprobado que 3 se ponen rojas si se
  quita la autenticación.

Verificado en producción: `/live` responde `401` sin sesión, y las salas siguen devolviendo
`404` a una llave inválida — la puerta abierta, la llave mala.

### 0-bis. Los barridos podían duplicarlo todo → CERRADO

Los cuatro barridos y el despachador corrían con `setInterval` sin ningún cerrojo
compartido. Con una réplica da igual; con dos, cada correo sale duplicado y cada
recordatorio le llega dos veces a quien espera su sesión. Subir las réplicas en Railway es
un clic, sin desplegar código.

**`src/config/cerrojo.js`** pide un turno a PostgreSQL (`pg_try_advisory_xact_lock` dentro
de una transacción, porque el pool de Prisma hace inservible un cerrojo de sesión). La
prueba encontró un fallo en mi primera versión: se tragaba los errores del trabajo, no solo
los de coordinar, lo que habría dejado los barridos fallando en silencio.

### 1. El `.env` local apuntaba a la base de PRODUCCIÓN → acotado

`aquiestamos-back/.env` sigue apuntando a Railway a propósito: a veces hay que depurar
contra datos reales y cortarlo por decreto solo empuja a la gente a saltarse la regla.
Lo que se cerró es el daño que eso causaba:

- **`src/config/baseSegura.js`** (nuevo) — decide qué es «una base en mi máquina» y
  aborta la operación cuando no lo es.
- **`server.js`** — al arrancar fuera de producción contra una base remota, imprime un
  aviso imposible de no ver. No bloquea: solo hace que nadie pueda alegar despiste.
- Las pruebas ya no pueden llegar allí (riesgo 2).

`prisma/purgar.js` **no** lleva la guarda, a propósito: está diseñado para correr contra
producción como cron de retención y ya exige `--si` para borrar de verdad.

### 2. `npm test` borraba la bandeja de producción → imposible

- **`.env.test`** (nuevo, versionado) — apunta a `aqui_estamos_test` en `localhost:5434`.
- **`vitest.config.js`** — carga `.env.test` **antes** que `.env`; dotenv no pisa lo ya
  definido, así que la base de pruebas gana aunque `.env` mire a producción.
- **`test/limpiarBandeja.js`** — llama a `exigirBaseLocal()` en `setup` y en `teardown`.
  Como es el `globalSetup` de vitest, si lanza, **la tanda entera aborta antes de la
  primera prueba**. Es el único punto del que ninguna prueba se escapa.

Comprobado a mano: forzando `DATABASE_URL` a Railway, vitest aborta con
`OPERACIÓN BLOQUEADA` y no ejecuta ni un test.

### 3. Deriva entre `schema.prisma` y las migraciones → cerrada

- **`prisma/migrations/20260827000000_puesta_al_dia_tras_db_push/`** (nueva) — recoge
  todo lo que había entrado por `db push`: 10 tablas, 5 enums, 5 alters, 24 índices,
  10 llaves foráneas. **Ni un solo DROP.**
- **`railway.json`** — el arranque ahora es
  `prisma generate && prisma migrate deploy && npm start`.

Verificado: producción coincidía ya *exactamente* con `schema.prisma`, y la cadena de
19 migraciones reconstruye desde cero una base idéntica al esquema.

### 4. Tokens de sala firmados con un secreto público → rotado y, de paso, activado

El agujero era peor de lo que parecía: **`generarTokenSala` estaba importado en dos
vistas pero no se llamaba desde ningún sitio.** Las vistas emitían `c.id` —el UUID crudo
de la cita— así que la capa HMAC entera era decorativa, y el rol lo elegía quien abría el
enlace con `?rol=profesional`.

- **`config/env.js`** — `MEETING_SECRET` obligatorio fuera de pruebas, sin valor por
  defecto. Sin él el backend no arranca. Se fue `env.jwtSecret`, que nunca existió.
- **`meeting.service.js`** — firma con el secreto real; el token ya no lleva marca de
  tiempo, así que el enlace que se manda por WhatsApp deja de cambiar en cada render.
- **`appointment.view.js` / `patient.view.js`** — emiten tokens firmados de verdad, uno
  por rol.
- **Frontend** — `agenda/[id]`, `ModalAgendar`, `PanelDelCaso` y `BotonRecordarCitaPrevia`
  usan el token en vez del UUID.
- **`DOMINIO_JITSI`** — ahora manda de verdad. Antes el ajuste del portal no hacía nada
  porque el servicio leía `process.env.JITSI_DOMAIN`.

Comprobado: el rol viaja sellado, un token manipulado se rechaza, y un token forjado con
el secreto que está publicado en GitHub **ya no vale**.

**Puerta cerrada (4-sep-2026).** Estuvo abierta a propósito durante la transición:
los enlaces que circulaban por WhatsApp eran `/sala/<uuid>` y apagarlo de golpe dejaba
tirada a gente con la cita confirmada. Mientras estuvo en `true`, quien conociera el UUID
de una cita entraba a su sala.

Producción lo tiene en `false` desde el 30 de agosto, y ahora **el defecto del código
también es `false`**: valía `true` cuando la variable faltaba, así que la puerta se abría
sola en cualquier entorno donde nadie se acordara de ponerla —un despliegue nuevo, un
staging, correr en local—. Un fallo de seguridad no debería depender de que alguien
recuerde una variable. Reabrirla exige `SALA_ACEPTA_UUID=true` a mano, y entonces
`test/enlaceDeSala.test.js` se pone rojo, que es lo que tiene que pasar.

### 5. (Encontrado al arreglar el 4) El profesional entraba a una sala vacía

No estaba en la lista original y era el más grave de todos, porque no era un riesgo
teórico: estaba pasando.

Las vistas, cuando una cita virtual no tenía `meetingUrl` guardada, se inventaban
`https://meet.jit.si/AquiEstamos-Sesion-<uuid>`. Esa sala **nunca fue la sala**: el nombre
real lo deriva `generarEnlaceVideollamada` a partir del secreto. Comprobado sobre una cita
`CONFIRMADA` real de producción:

```
profesional, desde /portal/mi-agenda  →  .../AquiEstamos-Sesion-19dfcd43-60ef-4f7b-a972-6657c4eabbd4
persona, desde /sala/<token>          →  .../AquiEstamos-19dfcd43-573cc0f7fce95b41
```

Salas distintas. Y **las 19 citas virtuales de producción tenían `meetingUrl` en null**,
así que el invento no era un caso raro: era el único camino. 7 de ellas seguían abiertas.

- **`appointment.view.js` / `patient.view.js`** — `meetingUrl` devuelve `null` cuando no
  hay ninguna guardada. Se acabó la segunda derivación; ahora solo existe una.
- **`mi-agenda/page.tsx`** — «Entrar a la sala» va a `/sala/<salaTokenProfesional>`. De
  paso, la entrada del profesional por fin queda en la telemetría.
- **`agenda/[id]/page.tsx`** — las condiciones que dependían de `meetingUrl` pasan a
  `modalidad === 'VIRTUAL' || meetingUrl`, y se muestra el enlace de sala en vez de la
  URL cruda de Jitsi.

La convergencia ahora es estructural, no una coincidencia: solo queda una función que
decide el nombre de la sala, y todo el mundo pasa por `/sala/<token>`.

---

## ✅ Desplegado

Backend y frontend en `main`, CI verde en ambos, producción verificada. `MEETING_SECRET`
está puesta en Railway. Las migraciones responden *«19 migrations found · Database schema
is up to date»*.

**Lo único con fecha, ya hecho:** `SALA_ACEPTA_UUID=false` desde el **30 de agosto**. La
última cita agendada antes del cambio a enlaces firmados era el 29 a las 8 p. m.; desde el
30, esa puerta ya no protegía a nadie y solo dejaba entrar a quien adivinara un UUID.
El 4 de septiembre se cerró también el defecto del código, que seguía siendo abierto.

---

## ✅ Línea base verificada (27-ago-2026, tras los arreglos)

| Comprobación | Antes | Ahora |
|---|---|---|
| `back` → `npm test` | ⚠️ 345/359 en 92 s | ✅ **372/372 en 9 s** |
| `front` → `tsc --noEmit` | ✅ 0 errores | ✅ 0 errores |
| `front` → `npm test` | ✅ 92/92 | ✅ 92/92 |
| `front` → `npm run build` | — | ✅ compila |

Los 13 fallos que desaparecieron eran contaminación: las pruebas contaban filas reales de
producción. El 14º era real y estaba caducado: `casoCompartido.flow` mandaba un
`YA_ATENDIDA` sin `followUp`, obligatorio desde la migración `el_reporte_dice_que_sigue`.
Se corrigió el envío y se le añadió la aserción de estado que faltaba, que es la razón de
que el fallo se viera como un conteo raro en vez de como un 422.

---

## 🔐 Autenticación y permisos

`cuidado:leer` (ADMIN, AGENDADOR, COORDINADOR_CASOS, LECTURA) y `cuidado:gestionar` (ADMIN, AGENDADOR, COORDINADOR_CASOS): el módulo de cuidado del equipo. Declarados en `permissions.js`, como todo.

**Flujo:** navegador → cookie httpOnly `ae_sesion` (primera parte) → Next reenvía como
`Authorization: Bearer` → backend valida. El token nunca es visible para JavaScript.

| Pieza | Archivo |
|---|---|
| Matriz de permisos (única fuente de verdad) | `back/src/auth/permissions.js` |
| Sesión / token | `back/src/auth/session.js` · `back/src/models/session.model.js` |
| Hash de contraseñas (argon2) | `back/src/auth/password.js` |
| Middleware | `back/src/middlewares/authenticate.js` · `authorize.js` |
| Puerta del portal | `front/middleware.ts` (solo comprueba que la cookie exista) |
| Helper de servidor | `front/lib/portal.ts` → `portalFetch`, `usuarioActual`, `puede` |
| Proxy autenticado del navegador | `front/app/api/portal/[...ruta]/route.ts` |

**7 roles:** `ADMIN` (`*`) · `AGENDADOR` · `ADMISION` · `COORDINADOR_CASOS` ·
`LIDERES_COMUNITARIOS` · `LECTURA` · `PROFESIONAL`

> Regla del proyecto: **nunca** `if (usuario.role === 'ADMIN')` en un controlador.
> Todo permiso nuevo se declara en `permissions.js` y se usa vía `authorize('x:y')`.

---

## 🌐 Sitio público

| Ruta | Archivo | Backend |
|---|---|---|
| Inicio | `front/app/(sitio)/page.tsx` | — |
| Atención psicológica | `front/app/(sitio)/atencion-psicologica/page.tsx` | `POST /api/support-requests` |
| Quiero ser parte | `front/app/(sitio)/quiero-ser-parte/page.tsx` | `POST /api/volunteers` |
| Quiero apoyar | `front/app/(sitio)/quiero-apoyar/page.tsx` | `POST /api/collaborators` |
| Recursos | `front/app/(sitio)/recursos/[slug]/page.tsx` | `GET /api/resources` · `/:slug` |
| Política de datos | `front/app/(sitio)/politica-de-datos/page.tsx` | — |

**Formularios:** `front/components/forms/` → `SupportRequestForm` (794 ln) ·
`VolunteerForm` (1412 ln) · `CollaboratorForm` (790 ln) · `MunicipioSelector` · `fields.tsx`

Los 3 endpoints públicos van con `formLimiter`: **20 envíos / 15 min por IP**
(`back/src/routes/index.js`).

---

## 🔗 Flujos por enlace firmado (sin sesión)

Cada uno es un token HMAC firmado con `SHARED_CASE_SECRET`, diferenciados por el campo `tipo`.

| Flujo | Página | Emisor del enlace | Endpoints | TTL |
|---|---|---|---|---|
| **Tamizaje** | `front/app/tamizaje/[token]/` | `back/src/auth/enlaceTamizaje.js` | `GET/POST /api/triage/:token` | 7 días |
| **Consentimiento** | `front/app/consentimiento/[token]/` | `enlaceConsentimiento.js` | `GET/POST /api/consentimiento/:token` | — |
| **Encuesta de cierre** | `front/app/encuesta/[token]/` | `enlaceEncuesta.js` | `GET/POST /api/encuesta/:token` | — |
| **Experiencia (feedback)** | `front/app/experiencia/[token]/` | `enlaceFeedback.js` | `GET/POST /api/experiencia/:token` | — |
| **Documentos del profesional** | `front/app/documentos/[token]/` | `enlaceDocumentos.js` | `GET /api/documentos-profesional/:token`<br>`POST /:token/archivo` · `POST /:token` | — |
| **Caso compartido** | `front/app/portal/caso/[id]/` | `enlaceCompacto.js` | `POST /api/shared-cases/:id/auth`<br>`GET /:id` · `POST /:id/propuesta` · `POST /:id/reporte` | 12 h |
| **Turno de voluntariado** | `front/app/(sitio)/turno/[token]/` | `services/taskToken.service.js` | `GET/POST /api/turno-confirmacion/:token`<br>`POST /:token/completar` | — |

---

**«¿Cómo estás tú?»** (`/cuidado/[token]`, enlace propio del PROFESIONAL, 90 días): `GET /cuidado-profesional/:token` (sesiones hechas, umbral, si se abre el espacio) y `POST` el mismo (apoyo para mí · ayuda con un caso · descargarme, más notas y la pregunta para la sesión grupal). Apunta a él y no a un caso: le sirve aunque los cierre todos, y no mezcla su espacio con el seguimiento de una persona acompañada. Ofrecerse como supervisor NO se pregunta aquí: se sabe por el formulario de voluntarios, se cuadra por WhatsApp y lo marca coordinación desde la ficha (`PATCH /cuidado/supervisores/:id`).

## 🖥️ Portal interno — página por página

Menú definido en `front/app/portal/(interno)/LateralPortal.tsx`.

### Operación

| Página | Archivos clave | Endpoints | Permiso |
|---|---|---|---|
| **Tablero** `/portal` | `(interno)/page.tsx` | `GET /dashboard`, `/dashboard/badges` | `agenda:leer` |
| **Solicitudes** `/portal/solicitudes` | `TablaSolicitudes.tsx` (487) · `BotonAdmitirSolicitud` · `BotonTamizaje` · `ResultadoTamizaje` | `GET /support-requests?all=true`<br>`POST /patients/admitir/:supportRequestId` | `solicitud:leer` |
| **Postulaciones** `/portal/postulaciones` | `TablaPostulaciones.tsx` (544) · `BotonAprobar` | `GET /volunteers?all=true`<br>`POST /professionals/aprobar/:volunteerId` | `postulacion:leer` |
| **Colaboradores** `/portal/colaboradores` | `TablaColaboradores.tsx` (817) · `FiltrosDirectorio` | `GET /collaborators?all=true` | `colaborador:leer` |
| **Tareas** `/portal/tareas` | `TableroKanbanCliente.tsx` · `[id]/PanelDetalleTarea.tsx` (850) · `nueva/FormularioTarea.tsx` (632) · `tipos.ts` | `GET/POST /tasks` · `PATCH /tasks/:id/status` · `POST /tasks/:id/assign` | `tarea:leer` |
| **Verificaciones** `/portal/verificaciones` | `TarjetaPendiente` · `ModalMoverColaborador` · `ModalRechazarVerificacion` · `BotonPedirDocumentos` | `POST /professionals/:id/tarjeta-profesional`<br>`/solicitar-documentos-email` · `/convertir-colaborador` · `/rechazar` | `profesional:verificar-tarjeta` |
| **Cuidado del equipo** `/portal/cuidado` | `ConvocarSesion` · `AccionesSesion` | `GET /cuidado` · `POST /cuidado/sesiones` · `PATCH /cuidado/sesiones/:id/estado` · `/asistencia` · `PATCH /cuidado/supervisores/:id` | `cuidado:leer` · `cuidado:gestionar` |

### Personas

| Página | Archivos clave | Endpoints | Permiso |
|---|---|---|---|
| **Personas** `/portal/personas` | `TablaPersonas.tsx` (689) · `ModalNotasSeguimiento` · `ModalSeguimientoGeneral` · `BotonSeguimientoWhatsApp` · `BotonRecordarCitaPrevia` | `GET /patients` | `paciente:leer` |
| **Detalle** `/portal/personas/[id]` | `PanelDelCaso.tsx` · `PanelEmparejamiento.tsx` · `ModalAgendar.tsx` (441) · `BotonReasignar` · `BotonCerrarCaso` · `BotonEncuesta` · `BotonPedirFeedback` · `BotonNuevaSesion` | `GET /patients/:id` · `/:id/candidatos` · `/:id/notes`<br>`POST /appointments/asignar` | `paciente:leer` |
| **Profesionales** `/portal/profesionales` | `TablaProfesionales.tsx` (480) | `GET /professionals` | `profesional:leer` |
| **Detalle profesional** `/portal/profesionales/[id]` | `EditorDisponibilidad.tsx` · `SeccionTarjetaProfesional` · `BotonCambiarEstadoProfesional` | `GET/PUT /professionals/:id/disponibilidad`<br>`POST/DELETE /:id/bloqueos` | `profesional:leer` |

### Agenda

| Página | Archivos clave | Endpoints | Permiso |
|---|---|---|---|
| **Agenda** `/portal/agenda` | `agenda/page.tsx` (940) — incluye banner de supervisión en vivo | `GET /appointments`, `/huecos`, `/historial`<br>`GET /meetings/live` | `agenda:leer` |
| **Detalle cita** `/portal/agenda/[id]` | `AccionesCita.tsx` · `MensajesFlujoCita.tsx` | `GET /appointments/:id`<br>`PATCH /:id/estado` · `/:id/consentimiento` · `POST /:id/reprogramar` | `agenda:leer` |
| **Mi agenda** `/portal/mi-agenda` | `mi-agenda/page.tsx` | `GET /appointments/mias` | `agenda:leer:propia` |

### Administración

| Página | Archivos clave | Endpoints | Permiso |
|---|---|---|---|
| **Usuarios** `/portal/usuarios` | `nuevo/` · `[id]/` · `CrearUsuarioForm` (550) · `EditarUsuarioForm` · `EliminarUsuarioForm` | `GET/POST/PATCH/DELETE /users`<br>`POST /users/:id/restablecer-clave` | `usuario:leer` |
| **Auditoría** `/portal/auditoria` | `TablaAuditoria.tsx` (1150) | `GET /audit` | `auditoria:leer` |
| **Métricas** `/portal/metricas` | `MetricasView.tsx` | `GET /dashboard/metricas` | `metricas:leer` |
| **Parametrización** `/portal/parametrizacion` | `ParametrizacionView.tsx` (705) | `GET/PATCH /settings/:key`<br>`POST /settings/:key/reset` · `/settings/preview` | `configuracion:leer` |

### Comunidad y Guía

| Página | Archivos clave | Endpoints | Permiso |
|---|---|---|---|
| **Líderes** `/portal/lideres` | `TablaLideres.tsx` (891) · `ModalLider` (503) · `ModalAdministrarCatalogo` (456) · `ModalBitacoraContacto` · `actions.ts` | `GET /leaders`, `/leaders/summary`, `/needs-catalog`<br>`POST /leaders/:id/contacts` | `lideres:leer` |
| **Procesos** `/portal/procesos` | `ProcesosClient.tsx` (700) · `DiagramaDelFlujo` · `DiagramasEtapa` · `piezas.tsx` | `GET /api/portal/manual-procesos` | (todos) |

---

## 🎥 Sala de videollamada y telemetría

| Pieza | Archivo |
|---|---|
| Sala de espera + llamada | `front/app/sala/[id]/page.tsx` |
| Proxy sin sesión | `front/app/api/meetings/[...ruta]/route.ts` |
| Generación de enlace y token | `back/src/services/meeting.service.js` ⚠️ (ver riesgo 4) |
| Controlador | `back/src/controllers/meetingTelemetry.controller.js` |
| Modelo | `back/src/models/meetingAccessLog.model.js` · Prisma `MeetingAccessLog` |

**Endpoints** (`/api/meetings`, sin autenticación de portal):
`GET /live` · `GET /:id/info` · `POST /:id/join` · `POST /logs/:logId/ping` ·
`POST /:id/leave` · `POST /:id/report-error`

El `ping` mantiene viva la sesión; `GET /live` alimenta el banner de supervisión del
tablero de agenda.

---

## ⚙️ Backend — arquitectura MVC

```
routes/ → middlewares (authenticate → authorize → validate) → controllers/
                                                                   ↓
                                              services/ (reglas) ←→ models/ (Prisma)
                                                                   ↓
                                                              views/ (serialización)
```

- **`validators/*.schema.js`** — Zod. Nada entra sin pasar por aquí.
- **`views/*.view.js`** — decide qué campos salen. Los avisos de coordinación
  deliberadamente **no** incluyen quién pidió ayuda.
- **`errors/DomainError.js`** + `middlewares/errorHandler.js` — errores de negocio con código.

### Servicios (la lógica que importa)

- `cuidado.service.js` — **Cuidado del equipo**: cuenta sesiones por profesional con `huboSesion`, abre el check-in a partir del umbral de Parametrización, marca supervisores (activos y con tarjeta verificada), convoca sesiones grupales —la agenda se arma sola con las preguntas de los invitados y los check-ins quedan apuntando a la sesión— y lleva una máquina de estados chica (`PROGRAMADA → REALIZADA | CANCELADA`) con `exigirTransicionGrupal`. No toca citas, asignaciones ni reportes: los lee para contar. La sala es un enlace externo a propósito: el módulo de salas es por cita y de dos personas.

| Servicio | Qué decide |
|---|---|
| `appointmentState.service.js` | Máquina de estados de la **cita**. `PROGRAMADA → CONFIRMADA → REALIZADA / NO_ASISTIO / CANCELADA / REPROGRAMADA` |
| `assignmentState.service.js` | Máquina de estados de la **asignación**. `PROPUESTA → ACEPTADA → ACTIVA → CERRADA`, con salidas `RECHAZADA` / `CANCELADA` |
| `scheduling.service.js` | Huecos, solapes, reglas de 45 min de sesión + 30 de descanso |
| `matching.service.js` | Candidatos: carga del profesional, ciudad, modalidad, disponibilidad |
| `triage.service.js` | Grado, capacidad y urgencia del tamizaje |
| `promotion.service.js` | Postulación → Profesional / Colaborador |
| `settings.service.js` | 31 parámetros del sistema con valores por defecto |
| `taskToken.service.js` | Enlaces de confirmación de turno de voluntariado |
| `timezone.service.js` | Todo en America/Bogota |
| `audit.service.js` | Registro en `AuditLog` |

> Cambiar un estado sin pasar por `exigirTransicion()` es la forma más rápida de
> corromper un caso. Las dos máquinas están centralizadas justo para eso.

### Barridos automáticos (arrancan en `server.js`)

| Barrido | Archivo | Cada | Qué hace |
|---|---|---|---|
| Despachador de avisos | `notifications/despachador.js` | 30 s | Envía la cola con reintentos escalonados |
| Admisión | `admision/barrido.js` | 1 h | Rescata a quien pidió ayuda y nunca respondió el tamizaje |
| Asignaciones | `asignacion/barrido.js` | 1 h | Libera asignaciones vencidas; el caso vuelve a la cola |
| Citas | `citas/barrido.js` | 1 h | Recordatorio (`RECORDATORIO_HORAS_ANTES`, 10 h), pide reporte (`PIDE_REPORTE_HORAS`, 2 h), alarma SLA prioridad ALTA |

### Notificaciones

`notifications/` → `eventos.js` (23 eventos) · `plantillas.js` (25 plantillas) ·
`mailerApi.js` (Brevo HTTPS) · `mailer.js` (SMTP) · `envoltura.js` · `despachador.js`

> Railway bloquea SMTP saliente en los planes Free/Trial/Hobby. En producción se usa
> `BREVO_API_KEY` (distinta de la clave SMTP).

### Almacenamiento de documentos

`almacenamiento/documentos.js` → Supabase, bucket **privado**, `service_role` key,
URL firmada de **60 s**. Endpoints: `POST /api/documentos` ·
`GET /api/documentos/:carpeta/:nombre` (con `documento:leer`) · `GET /api/documentos/limites`.

> Antes vivían en `front/public/uploads/`, servido al mundo sin sesión y versionado en git.
> Nunca volver ahí.

---

## 🗄️ Modelo de datos — `back/prisma/schema.prisma`

Cuidado del equipo (migración `20260905013420_cuidado_del_equipo`): `Professional.supervisorVolunteer(+At)`, `ProfessionalCheckIn` (necesidad, notas, pregunta para el grupo, sesiones al pedirlo, y a qué sesión se le invitó), `SupportGroupSession` (facilitador, hora, enlace externo, agenda, estado) y `SupportGroupInvitation` (sesión × profesional, asistió). Enums `CheckInNeed` y `GroupSessionStatus`.

**Identidad y trazabilidad:** `User` · `Session` · `AuditLog`

**Entrada:** `Volunteer` · `SupportRequest` · `TriageResponse`

**Operación:** `Professional` · `Patient` · `PatientNote` · `Collaborator` ·
`CaseAssignment` · `CaseReport`

**Agenda:** `Appointment` · `AvailabilityRule` · `AvailabilityException` · `MeetingAccessLog`

**Cierre:** `ClosureSurvey` · `PatientFeedback`

**Comunidad:** `CommunityLeader` · `CommunityLeaderNeed` · `CommunityLeaderContact` ·
`NeedCategory`

**Voluntariado interno:** `Task` · `TaskAssignment`

**Sistema:** `SystemSetting` · `Notification` · `Resource` · `ResourceCategory`

---

## 🎛️ Parametrización — 58 claves (`/portal/parametrizacion`)

Cuidado del equipo: `SESIONES_PARA_CHECKIN` (NUMERO, 3) y los correos `CORREO_CHECKIN_RECIBIDO` (a coordinación) y `CORREO_SESION_GRUPAL` (a invitados y facilitador).

**18 mensajes de WhatsApp.** Los pasos son los de `front/lib/pasosDelCaso.ts`, que
son siete. Esta lista llevaba los del manual viejo de diez —«paso 1», «2b», «3/8»,
«9b», «10»— y contradecía al `name` de cada clave, que sí está alineado:

| Clave | Paso |
|---|---|
| `WHATSAPP_TAMIZAJE` | 2 · Admisión |
| `WHATSAPP_PROPUESTA_PROFESIONAL` | 3 · Asignar profesional |
| `WHATSAPP_CUADRAR_HORARIO_PERSONA` | 4 · Elige su hora |
| `WHATSAPP_CONFIRMAR_CITA_PERSONA` | 5 · Preparar la sesión |
| `WHATSAPP_CONSENTIMIENTO` | 5 · Preparar la sesión |
| `WHATSAPP_CONSENTIMIENTO_FIRMADO` | 5 · Preparar la sesión |
| `WHATSAPP_DESPACHO_PROFESIONAL` | 5 · Preparar la sesión |
| `WHATSAPP_RECORDATORIO_PREVIO` | 5 · Preparar la sesión |
| `WHATSAPP_RECORDATORIO_PREVIO_PERSONA` | 5 · Preparar la sesión |
| `WHATSAPP_SIGUIENTE_CITA_PROFESIONAL` | 7 · Seguimiento (nuevo ciclo 4→5) |
| `WHATSAPP_FEEDBACK_PERSONA` | 7 · Seguimiento y cierre |

Y cinco que no son de un paso, sino de una rama: `WHATSAPP_REAGENDAMIENTO_PEDIR_DISP`
y `WHATSAPP_REAGENDAMIENTO_EXCUSAS` (mover la sesión), **`WHATSAPP_CAMBIO_DE_PROFESIONAL`**
(reasignar), `WHATSAPP_PEDIR_DOCUMENTOS` y `WHATSAPP_LIDER_COMUNITARIO`.

### La forma del acompañamiento no es una línea

Los siete pasos se leen como una secuencia, y no lo son:

```
1 → 2 → 3 → 4 → (5 → 6 → 4)* → 7
```

Los pasos **1 a 3 ocurren una vez**. El **7 ocurre una vez, al final**. Y el
**4-5-6 se repite por cada sesión**: ella vuelve a elegir hora con el mismo
enlace, se prepara la sesión, ocurre, y vuelta a empezar.

`pasoDelCaso()` devuelve un solo número, así que en un caso en curso oscila
entre el 5 y el 6 y nunca vuelve a marcar el 4. Eso es una limitación conocida y
aceptada: la tira lo dice con una línea debajo —«los pasos 4 a 6 se repiten en
cada sesión: este acompañamiento lleva N sesiones»— en vez de fingir que el caso
avanza en línea recta. Antes, ver el paso actual pasar del 6 al 4 parecía un
error, y un caso de seis sesiones se veía igual que uno de una.

> **El paso 6 no tiene mensaje, y no le falta.** Su acción es la sala: lo que
> ocurre ahí es entrar a la videollamada, y ese enlace ya viaja en el despacho
> del paso 5 y en el correo de cita agendada. El paso 1 tampoco tiene mensaje
> propio, por lo mismo: es un formulario que se llena, no algo que se avisa.
>
> Si alguna vez hace falta uno, el candidato es un «¿pudiste conectarte?»
> cuando nadie entró a la sala pasada la hora — hoy una sesión que no ocurre
> solo se detecta cuando alguien la reporta. Pero eso es una función nueva, no
> un hueco que tapar.

**26 plantillas de correo.** Eran 8 conectadas de 27 que existen: las otras 19 se
podían editar —o ni aparecían— y el correo salía igual, con el texto del código.
La correspondencia clave-de-aviso → clave-del-portal está escrita explícita en
`src/notifications/plantillaEditable.js`, y `test/correosConectados.test.js`
compara los dos caminos byte a byte: conectar no puede cambiar ni una coma de lo
que sale hoy.

Queda fuera a propósito **`COORD_ERROR`**, que es una alerta técnica de servidor
y no un mensaje a una persona: no tiene sentido que coordinación reescriba el
informe de un fallo.

> Una plantilla del portal **no sabe ramificar ni transformar**. Si el texto
> depende de un `if`, traduce un enum, formatea una fecha o baja algo a
> minúscula, eso se calcula en `notifications/eventos.js` y viaja como variable
> ya redactada. Saltarse esta regla es lo que hizo que un correo dijera
> «ACEPTADO» en el asunto y «❌ No puede en este momento» en el cuerpo.

**11 parámetros generales:** `DURACION_CITA_MINUTOS` · `DESCANSO_CITA_MINUTOS` ·
`DIAS_VENCIMIENTO_PROPUESTA` · `DIAS_VENCIMIENTO_ACEPTADA` · `SLA_MAXIMO_ALTA_DIAS` ·
`CONFIRMAR_DISPONIBILIDAD_DIAS` · `DOMINIO_JITSI` · `TELEFONO_SOPORTE_OFICIAL` ·
`NOMBRE_RED` · `SITIO_WEB_URL` · y el resto en `settings.service.js`

> Estos valores se editan desde el portal, no en código. Antes de hardcodear un texto,
> mirar si ya existe la clave.

---

## 🔑 Variables de entorno

### Backend (`back/src/config/env.js`)

| Variable | Obligatoria | Nota |
|---|---|---|
| `DATABASE_URL` | ✔ | Apunta a producción en local; el arranque lo avisa a gritos. Las pruebas usan `.env.test` |
| `SHARED_CASE_SECRET` | ✔ | Sin esto el backend **no arranca** (a propósito) |
| `MEETING_SECRET` | ✔ | Firma los enlaces de sala. Sin esto **no arranca**. Distinta de la anterior |
| `SALA_ACEPTA_UUID` | | `false`. Ponlo en `true` solo para reabrir los enlaces de sala sin firma |
| `CORS_ORIGINS` | | Coma-separado. Por defecto `http://localhost:3000` |
| `SESSION_TTL_HOURS` | | 12 |
| `SHARED_CASE_TTL_HOURS` | | 12 |
| `TRIAGE_TTL_HOURS` | | 168 (7 días) |
| `BREVO_API_KEY` | | Correo por HTTPS. Distinta de la clave SMTP |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM` | | Alternativa; vacío = avisos se encolan sin enviar |
| `NOTIFICACIONES_COORDINACION` | | `redaquiestamos@gmail.com` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | | Sin esto **todo** lo de documentos falla |
| `SUPABASE_BUCKET` / `SUPABASE_FIRMA_SEGUNDOS` | | `documentos` / 60 |
| `SITIO_URL` | | Enlaces dentro de los correos |
| `RECORDATORIO_HORAS_ANTES` / `PIDE_REPORTE_HORAS` | | 10 / 2 |
| `JITSI_DOMAIN` | | Valor de arranque; manda `DOMINIO_JITSI` de Parametrización |
| `BOOTSTRAP_ADMIN_*` | | Solo para el seed inicial |
| **`JWT_SECRET`** | ❌ | **Falta**. Ver riesgo 4 |

### Frontend

`BACKEND_URL` — solo servidor, nunca llega al navegador.

---

## 🧰 Comandos

### Base local (hace falta para `npm test`)

El Postgres portátil vive junto a los repos. No es un servicio de Windows: hay que
arrancarlo a mano después de cada reinicio. Desde `scratch/aquiestamos`:

```powershell
.\pgsql\bin\pg_ctl.exe -D .\pgdata -o "-p 5434" -l .\pgdata\arranque.log start
```

Para pararlo:

```powershell
.\pgsql\bin\pg_ctl.exe -D .\pgdata stop
```

Bases creadas en esa instancia: `aqui_estamos` (desarrollo), `aqui_estamos_test`
(pruebas, la que usa `.env.test`) y `aqui_estamos_shadow` (shadow de Prisma para
`migrate diff` y `migrate dev`).

Esa instalación es mínima: trae `pg_ctl`, `postgres` e `initdb`, pero **no `psql` ni
`createdb`**. Para crear una base más, lo más corto es un script de Node dentro de
`aquiestamos-back` con `$executeRawUnsafe('CREATE DATABASE "…"')`.

### Backend

```
npm run dev               node --watch src/server.js
npm start                 producción
npm test                  vitest run (usa .env.test, base local)
npm run prisma:generate   / prisma:migrate / prisma:deploy / prisma:studio
npm run db:seed           / db:seed-admin  / db:seed-roles
npm run db:purgar         prisma/purgar.js           ⚠️ DESTRUCTIVO
npm run db:importar       importarPostulaciones.js
npm run correo:probar     probarCorreo.js
npm run avisos:despachar  despachar la cola a mano
npm run admision:rescatar admitirSinRespuesta.js
```

### Frontend

```
npm run dev  ·  npm run build  ·  npm run lint  ·  npm run typecheck  ·  npm test
```

---

## 🧪 Pruebas

**Backend** (`back/test/`) — 359 pruebas:

- Unitarias: `auth` · `permissions` · `validators` · `asignacion` · `avisos` ·
  `colaboradores` · `consentimiento` · `documentos` · `settings` · `tamizaje` · `tasks`
- Integración (`test/integration/`, necesitan base): `agenda.flow` · `auth.flow` ·
  `avisos.flow` · `casoCompartido.flow` · `colaboradores.flow`

**Frontend** (`front/test/`) — 92 pruebas: `contraste` · `mensajes` · `nombre` · `telefono`

---

## 📌 Reglas para no romper nada

1. **`npm test` ya no puede tocar producción.** La guarda de `src/config/baseSegura.js` aborta la tanda si `DATABASE_URL` no es local. No la desactives: existe porque ya pasó.
2. **Un permiso nuevo se declara en `permissions.js`**, no con un `if` de rol en el controlador.
3. **Un estado se cambia con `exigirTransicion()`**, nunca con un `update` directo.
4. **Un texto de cara al usuario se busca primero en Parametrización** (31 claves) antes
   de escribirlo en el código.
5. **Un documento personal no se guarda en `public/`.** Siempre Supabase con URL firmada.
6. **Toda entrada pasa por un schema Zod** en `validators/`.
7. **`AGENTS.md` del frontend lo reescribe `next dev`** — si aparece en el diff, va con el commit.
8. **Los cambios de esquema van en una migración**, no en `db push`. `railway.json` corre `prisma migrate deploy` en cada arranque; un `db push` a escondidas vuelve a abrir la deriva que se acaba de cerrar.
9. **Un enlace de sala lleva token firmado**, nunca el UUID de la cita. El rol viaja sellado dentro.
10. **Nadie deriva el nombre de una sala por su cuenta.** Solo lo hace `generarEnlaceVideollamada`, y para entrar se pasa siempre por `/sala/<token>`. Una segunda derivación en paralelo es cómo el profesional acabó esperando solo en una sala vacía.
