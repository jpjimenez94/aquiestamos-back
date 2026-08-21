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
  sharedCaseSecret:
    process.env.NODE_ENV === 'production'
      ? required('SHARED_CASE_SECRET')
      : process.env.SHARED_CASE_SECRET ?? 'secreto-de-desarrollo-no-usar-en-produccion',

  // Cuanto dura un enlace de caso compartido antes de pedir el correo otra vez.
  sharedCaseTtlHours: Number(process.env.SHARED_CASE_TTL_HOURS ?? 12),

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
    /// A dónde llegan los avisos internos. Si está vacío, van a todas las
    /// cuentas de administración activas.
    coordinacion: (process.env.NOTIFICACIONES_COORDINACION ?? '')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
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
