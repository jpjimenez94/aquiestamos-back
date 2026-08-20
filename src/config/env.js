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

  // Primera cuenta de administrador, solo para el seed inicial.
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '',
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administración',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
}

export const isProduction = env.nodeEnv === 'production'
