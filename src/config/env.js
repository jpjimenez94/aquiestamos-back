import 'dotenv/config'

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5434/aqui_estamos'),

  // Orígenes permitidos para CORS, separados por coma.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // Duración de la sesión del portal.
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),

  // Firma de los enlaces de caso compartido. Es un secreto aparte a proposito:
  // reutilizar DATABASE_URL mete la contrasena de la base en un contexto de
  // firma y ata la validez de los enlaces a la rotacion de esa contrasena.
  // Se exige SIEMPRE, salvo en las pruebas. Antes solo se exigía cuando
  // NODE_ENV valía 'production', y eso resultó ser una trampa: si el servidor
  // arranca sin esa variable —cosa que pasa por omisión en Railway— caía al
  // valor por defecto, que está publicado en GitHub. Cualquiera podía firmar
  // un enlace de caso válido. Ahora, sin secreto, el backend no arranca: un
  // fallo ruidoso es infinitamente mejor que uno silencioso aquí.
  sharedCaseSecret:
    process.env.NODE_ENV === 'test'
      ? process.env.SHARED_CASE_SECRET ?? 'secreto-solo-para-pruebas'
      : required('SHARED_CASE_SECRET'),

  // Cuanto dura un enlace de caso compartido antes de pedir el correo otra vez.
  sharedCaseTtlHours: Number(process.env.SHARED_CASE_TTL_HOURS ?? 12),

  // Firma de los enlaces de sala de videollamada. Mismo razonamiento que
  // `sharedCaseSecret`, y por la misma razón se exige siempre salvo en pruebas.
  //
  // Aquí hubo un agujero peor que el de antes. `meeting.service.js` firmaba
  // con `env.jwtSecret || 'aqui-estamos-secret-key'`, y `jwtSecret` NUNCA
  // existió en este archivo: siempre valía `undefined`, así que todo se
  // firmaba con ese literal, que está publicado en GitHub. Cualquiera que
  // leyera el repositorio podía fabricar un token de sala válido y entrar a la
  // sesión de una persona en terapia.
  //
  // Un `||` con valor por defecto convierte un secreto ausente en un secreto
  // público sin decir nada. Por eso aquí no hay valor por defecto: sin la
  // variable, el backend no arranca.
  meetingSecret:
    process.env.NODE_ENV === 'test'
      ? process.env.MEETING_SECRET ?? 'secreto-de-sala-solo-para-pruebas'
      : required('MEETING_SECRET'),

  // Dominio de Jitsi donde se abren las salas. Es solo el valor de arranque:
  // manda `DOMINIO_JITSI` de Parametrización cuando está configurado.
  jitsiDomain: process.env.JITSI_DOMAIN ?? 'meet.jit.si',

  /**
   * ¿Se acepta todavía un UUID de cita crudo como llave de la sala? Ya no.
   *
   * Valió `true` durante la transición, y no quedaba más remedio: los enlaces
   * que circulaban por WhatsApp eran `/sala/<uuid-de-la-cita>` y apagarlo de
   * golpe dejaba tirada a gente con la cita confirmada. Con la puerta abierta,
   * quien conociera el UUID de una cita entraba a la sala.
   *
   * La transición terminó —producción lo tiene en `false` desde el 30 de
   * agosto— y por eso el DEFECTO cambia. Que fuera `true` cuando la variable
   * falta significaba que la puerta se abría sola en cualquier entorno donde
   * nadie se acordara de ponerla: un despliegue nuevo, un staging, o correr en
   * local. Un fallo de seguridad no debería depender de que alguien recuerde
   * una variable.
   *
   * Para reabrirla hay que pedirlo a mano con `SALA_ACEPTA_UUID=true`, y
   * entonces es una decisión, no un olvido.
   */
  salaAceptaUuid: (process.env.SALA_ACEPTA_UUID ?? 'false').toLowerCase() === 'true',

  // Cuanto dura el enlace del tamizaje. Es mucho mas largo que el del caso a
  // proposito: quien esta en crisis no responde un formulario en el momento en
  // que le llega el mensaje, y un enlace vencido al dia siguiente significa
  // que hay que volver a escribirle. Firma con el mismo secreto que el enlace
  // de caso; lo que separa a los dos es el campo `tipo` del token.
  triageTtlHours: Number(process.env.TRIAGE_TTL_HOURS ?? 24 * 7),

  // Envío de avisos por correo. Se habla SMTP y no la API del proveedor a
  // propósito: cambiar de Brevo a otro es cambiar estas variables, no código.
  // Si SMTP_HOST viene vacío, los avisos se siguen encolando pero no se
  // envían: nada se pierde y arrancan solos en cuanto se configure.
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    usuario: process.env.SMTP_USER ?? '',
    clave: process.env.SMTP_PASSWORD ?? '',
    remitente: process.env.SMTP_FROM ?? 'Red Aquí Estamos <no-responder@redaquiestamos.org>',
    /// A dónde llegan los avisos internos. Incluye el buzón oficial redaquiestamos@gmail.com.
    coordinacion: (process.env.NOTIFICACIONES_COORDINACION ?? 'redaquiestamos@gmail.com')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  },

  /**
   * Almacenamiento de documentos: tarjetas profesionales, certificados de
   * estudio y consentimientos firmados.
   *
   * Antes se guardaban en `front/public/uploads/`, que es la carpeta que Next
   * sirve al mundo entero sin pedir sesión, y que además el repositorio
   * versionaba. Un documento de identidad no puede vivir ahí.
   *
   * La clave que va aquí es la `service_role` de Supabase, no la `anon`: es la
   * única que puede leer y escribir en un bucket privado. Por eso vive solo en
   * el backend y NUNCA se le manda al navegador; lo que el portal recibe es
   * una URL firmada que caduca en un minuto.
   *
   * Si esto está vacío, subir un documento falla con un mensaje que lo dice.
   * Falla ruidosamente a propósito: guardar el archivo en el disco del
   * servidor "mientras tanto" es cómo se llegó al problema anterior.
   */
  supabase: {
    url: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
    bucket: process.env.SUPABASE_BUCKET ?? 'documentos',
    /// Cuánto vive el enlace que se le da al navegador para ver un documento.
    /// Un minuto: lo que tarda en abrirse la imagen, no más.
    firmaSegundos: Number(process.env.SUPABASE_FIRMA_SEGUNDOS ?? 60),
  },

  /// Clave de la API de Brevo. Es DISTINTA de la clave SMTP.
  ///
  /// Con esto puesto, los correos salen por HTTPS en vez de por SMTP. Hace
  /// falta en Railway: sus planes Free, Trial y Hobby bloquean el SMTP
  /// saliente y los envíos mueren por tiempo agotado, sin más pista.
  brevoApiKey: process.env.BREVO_API_KEY ?? '',

  /// Dirección pública del sitio. Los avisos llevan enlaces, y un enlace a
  /// localhost dentro de un correo no le sirve a nadie.
  sitioUrl: process.env.SITIO_URL ?? 'http://localhost:3000',

  // Primera cuenta de administrador, solo para el seed inicial.
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '',
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administración',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
}

export const isProduction = env.nodeEnv === 'production'
