import { ETIQUETAS_RESULTADO, ETIQUETAS_QUE_SIGUE } from '../catalogos.js'

/**
 * VISTA: CaseReport
 */
export function reporte(r) {
  return {
    id: r.id,
    outcome: r.outcome,
    resultadoLegible: ETIQUETAS_RESULTADO[r.outcome] ?? r.outcome,
    modality: r.modality,
    meetsAt: r.meetsAt,
    contactDifficulties: r.contactDifficulties,
    notes: r.notes,
    followUp: r.followUp,
    queSigueLegible: r.followUp ? ETIQUETAS_QUE_SIGUE[r.followUp] ?? r.followUp : null,
    reportedByEmail: r.reportedByEmail,
    createdAt: r.createdAt,
  }
}

export function reporteLista(lista) {
  return lista.map(reporte)
}

/**
 * Lo que ve el profesional en su propio enlace: lo mismo, menos el correo.
 * Ya sabe quién es; repetírselo solo ocupa sitio.
 */
export function reporteParaProfesional(r) {
  const { reportedByEmail, ...resto } = reporte(r)
  return resto
}

export function reporteListaParaProfesional(lista) {
  return lista.map(reporteParaProfesional)
}
