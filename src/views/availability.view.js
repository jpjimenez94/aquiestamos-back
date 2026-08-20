import { ETIQUETAS_DIA, ETIQUETAS_FRANJA } from '../catalogos.js'

function comoHora(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0')
  const m = String(minutos % 60).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * VISTA: AvailabilityRule / AvailabilityException
 */
export function regla(r) {
  return {
    id: r.id,
    dia: r.weekday,
    diaLegible: ETIQUETAS_DIA[r.weekday] ?? r.weekday,
    desde: comoHora(r.startMinute),
    hasta: comoHora(r.endMinute),
    desdeMinuto: r.startMinute,
    hastaMinuto: r.endMinute,
    modalidad: r.modality,
    activa: r.active,
  }
}

export function reglaLista(lista) {
  return lista.map(regla)
}

export function bloqueo(b) {
  return { id: b.id, inicio: b.startsAt, fin: b.endsAt, motivo: b.reason }
}

export function bloqueoLista(lista) {
  return lista.map(bloqueo)
}

export function hueco(h) {
  return {
    inicio: h.inicio,
    fin: h.fin,
    modalidad: h.modalidad,
    duracionMinutos: h.duracionMinutos,
  }
}

export function huecoLista(lista) {
  return lista.map(hueco)
}

export { ETIQUETAS_FRANJA }
