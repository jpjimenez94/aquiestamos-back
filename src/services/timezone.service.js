/**
 * Conversión entre hora de Bogotá y UTC.
 *
 * Las reglas de disponibilidad se expresan en hora local ("los martes de 2 a
 * 6"), pero las citas se guardan en UTC. Aquí está el puente.
 *
 * Colombia no tiene horario de verano, pero no se da por sentado: se usa
 * `Intl` para leer el desfase real en cada instante. Si algún día cambia, o si
 * la red opera en otra zona, basta con cambiar ZONA.
 */

export const ZONA = 'America/Bogota'

const formateador = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Descompone un instante en sus partes de calendario en hora de Bogotá. */
export function partesLocales(fecha) {
  const partes = {}
  for (const { type, value } of formateador.formatToParts(fecha)) {
    if (type !== 'literal') partes[type] = Number(value)
  }
  // `hour12: false` puede devolver 24 en lugar de 0 a medianoche.
  if (partes.hour === 24) partes.hour = 0
  return partes
}

/** Desfase de la zona respecto a UTC, en milisegundos, en ese instante. */
function desfase(fecha) {
  const p = partesLocales(fecha)
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return comoUtc - Math.floor(fecha.getTime() / 1000) * 1000
}

/**
 * Convierte una fecha y hora local de Bogotá al instante UTC correspondiente.
 * Dos pasadas: la primera estima el desfase, la segunda lo corrige por si el
 * propio cambio de hora movió la respuesta a otro tramo horario.
 */
export function deLocalAUtc(year, month, day, minutosDelDia) {
  const hour = Math.floor(minutosDelDia / 60)
  const minute = minutosDelDia % 60
  const supuesto = Date.UTC(year, month - 1, day, hour, minute, 0, 0)

  let instante = new Date(supuesto - desfase(new Date(supuesto)))
  instante = new Date(supuesto - desfase(instante))
  return instante
}

/** Día de la semana en hora de Bogotá, como el enum `Weekday` de Prisma. */
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']

export function diaDeLaSemana(fecha) {
  const p = partesLocales(fecha)
  // Date.UTC con las partes locales da el día de la semana local.
  const indice = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  return DIAS[indice]
}

/** Minutos transcurridos desde la medianoche local. */
export function minutosDelDia(fecha) {
  const p = partesLocales(fecha)
  return p.hour * 60 + p.minute
}

/** Lista de fechas de calendario (año, mes, día) entre dos instantes, en local. */
export function diasEntre(desde, hasta) {
  const dias = []
  const p = partesLocales(desde)
  // Se avanza en pasos de un día desde la medianoche local del primer día.
  let cursor = deLocalAUtc(p.year, p.month, p.day, 0)
  const limite = hasta.getTime()

  while (cursor.getTime() <= limite && dias.length < 400) {
    const q = partesLocales(cursor)
    dias.push({ year: q.year, month: q.month, day: q.day })
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return dias
}

/** Formato legible para mostrar en mensajes y exportes. */
export function formatearLocal(fecha) {
  const p = partesLocales(fecha)
  const dos = (n) => String(n).padStart(2, '0')
  return `${p.year}-${dos(p.month)}-${dos(p.day)} ${dos(p.hour)}:${dos(p.minute)}`
}

/** Etiqueta de la franja del día a la que pertenece un instante. */
export function franjaDe(fecha) {
  const m = minutosDelDia(fecha)
  if (m < 12 * 60) return 'MANANA'
  if (m < 18 * 60) return 'TARDE'
  return 'NOCHE'
}

/** Rango de minutos que cubre cada franja. */
export const FRANJAS = {
  MANANA: { desde: 8 * 60, hasta: 12 * 60 },
  TARDE: { desde: 12 * 60, hasta: 18 * 60 },
  NOCHE: { desde: 18 * 60, hasta: 21 * 60 },
}
