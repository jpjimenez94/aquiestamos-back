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

  // Primera cuenta de administrador, solo para el seed inicial.
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '',
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administración',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
}

export const isProduction = env.nodeEnv === 'production'
