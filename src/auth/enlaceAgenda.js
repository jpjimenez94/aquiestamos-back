import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

/**
 * El enlace con el que la persona agenda sus propias sesiones.
 *
 * Los otros cinco enlaces públicos son de un trámite: este tamizaje, este
 * consentimiento, esta encuesta. Se usan una vez y se acaban. Este es distinto
 * y la diferencia es deliberada: **apunta a la PERSONA, no a la pareja
 * persona-profesional ni a una cita concreta.**
 *
 * Eso resuelve algo que hoy cuesta trabajo humano cada vez. El acompañamiento
 * sigue a la persona: en la tercera sesión puede cambiar de profesional, y el
 * profesional anterior queda libre para otros. Si el enlace fuera del par, un
 * cambio lo invalidaría y habría que mandarle uno nuevo justo en el momento en
 * que la persona ya está desorientada por el cambio.
 *
 * Como apunta a la persona, el mismo enlace que se le mandó el primer día
 * sigue sirviendo después del cambio: al abrirlo se busca quién es su
 * profesional AHORA y se muestran los huecos de esa agenda. La continuidad del
 * acompañamiento queda expresada en una URL que no cambia.
 *
 * Vive 180 días porque un acompañamiento dura meses y este enlace se usa una
 * vez por sesión, no una vez en la vida. Que caduque a mitad del proceso
 * significa volver a la coordinación manual, que es justo lo que viene a
 * quitar.
 */

const TIPO = 'agenda'
const TTL_MS = 180 * 24 * 3600 * 1000

export function crearEnlaceAgenda(patientId) {
  return crearCompacto(CODIGO.agenda, patientId, Date.now() + TTL_MS)
}

export function leerEnlaceAgenda(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const compacto = leerCompacto(token, CODIGO.agenda)
  if (compacto) return { tipo: TIPO, paciente: compacto.uuid, vence: compacto.vence }

  // No hay formato viejo que soportar: este enlace nace con el compacto.
  return null
}
