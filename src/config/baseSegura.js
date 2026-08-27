/**
 * Guarda: nada destructivo corre contra una base que no sea local.
 *
 * El 27 de agosto de 2026 una corrida de `npm test` borró 53 avisos de la
 * bandeja de producción. No hubo malicia ni un bug sutil: el `.env` de
 * desarrollo apuntaba a la base de Railway y el `globalSetup` de vitest hace
 * `notification.deleteMany({})` sin filtro. Las dos cosas son razonables por
 * separado; juntas borran datos reales.
 *
 * La lección no es «tener cuidado». Es que el cuidado no escala: basta un
 * `.env` mal apuntado, un `DATABASE_URL` exportado en la terminal equivocada o
 * un despiste a las siete de la tarde. Lo que sí escala es que el proceso se
 * niegue a arrancar.
 *
 * Por eso esto no avisa: aborta.
 */

/** Anfitriones que consideramos «mi máquina». */
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/**
 * Descompone una URL de PostgreSQL sin depender de nada externo.
 * Devuelve `null` si no se puede leer, que para esta guarda cuenta como «no
 * demostrablemente local» y por tanto se rechaza.
 */
export function describirBase(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return {
      anfitrion: u.hostname,
      puerto: u.port || '5432',
      nombre: decodeURIComponent(u.pathname.replace(/^\//, '')) || '(sin nombre)',
    }
  } catch {
    return null
  }
}

/** ¿Esta URL apunta a una base en mi propia máquina? */
export function esBaseLocal(url) {
  const base = describirBase(url)
  if (!base) return false
  return ANFITRIONES_LOCALES.has(base.anfitrion)
}

/**
 * Texto corto y sin secretos para poner en logs y mensajes de error.
 * Nunca incluye usuario ni contraseña: estos mensajes acaban en consolas
 * compartidas y en la salida de CI.
 */
export function describirBaseParaHumanos(url) {
  const base = describirBase(url)
  if (!base) return '(DATABASE_URL ausente o ilegible)'
  return `${base.nombre} en ${base.anfitrion}:${base.puerto}`
}

/**
 * Aborta el proceso si `DATABASE_URL` no apunta a una base local.
 *
 * Lo usan el arranque de las pruebas y los scripts que borran cosas. El
 * `motivo` sale en el mensaje para que quien lo vea entienda qué se estaba a
 * punto de hacer, no solo que algo falló.
 */
export function exigirBaseLocal(motivo) {
  const url = process.env.DATABASE_URL

  if (esBaseLocal(url)) return url

  const donde = describirBaseParaHumanos(url)
  throw new Error(
    [
      '',
      '  ╔══════════════════════════════════════════════════════════════════╗',
      '  ║  OPERACIÓN BLOQUEADA: la base no es local                        ║',
      '  ╚══════════════════════════════════════════════════════════════════╝',
      '',
      `  Se intentó: ${motivo}`,
      `  Contra:     ${donde}`,
      '',
      '  Esto borra o altera datos, y solo se permite contra una base en tu',
      '  propia máquina. Si esa base es la de producción, lo que acabas de',
      '  evitar es perder datos de gente real.',
      '',
      '  Para trabajar en local:',
      '',
      '    DATABASE_URL="postgresql://postgres:postgres@localhost:5434/aqui_estamos_test"',
      '',
      '  Las pruebas ya lo hacen solas: `npm test` carga `.env.test`.',
      '',
    ].join('\n'),
  )
}
