import { SettingsService } from '../services/settings.service.js'

/**
 * Los correos que la coordinación puede reescribir desde Parametrización.
 *
 * Las ocho plantillas de correo del portal no las leía nadie. Se editaban, se
 * guardaban, la pantalla decía «guardado» — y el correo salía con el texto del
 * código. Es el mismo fallo que tenían los mensajes de WhatsApp, y falla igual
 * de callado: no hay error, no hay aviso, solo una pantalla que promete algo
 * que no ocurre.
 *
 * La clave del aviso —CITA_AGENDADA— y la del portal —CORREO_CITA_AGENDADA— no
 * coinciden porque nacieron por separado, así que la correspondencia se
 * escribe una vez y explícita: adivinarla con un prefijo funcionaría hoy y se
 * rompería en cuanto alguien añada una que no siga el patrón, sin que nadie se
 * entere.
 */
export const PLANTILLA_DEL_PORTAL = {
  POSTULACION_RECIBIDA: 'CORREO_POSTULACION_RECIBIDA',
  POSTULACION_APROBADA: 'CORREO_POSTULACION_APROBADA',
  SOLICITUD_DOCUMENTOS_PROFESIONAL: 'CORREO_SOLICITUD_DOCUMENTOS',
  CITA_AGENDADA: 'CORREO_CITA_AGENDADA',
  CITA_AGENDADA_PERSONA: 'CORREO_CITA_AGENDADA_PERSONA',
  REPORTE_RECIBIDO: 'CORREO_REPORTE_RECIBIDO',
  TAREA_INVITACION: 'CORREO_TAREA_INVITACION',
  TAREA_RESPUESTA: 'CORREO_TAREA_RESPUESTA',
  APOYO_RECIBIDO: 'CORREO_VOLUNTARIO_APOYO_RECIBIDO',

  COORD_POSTULACION: 'CORREO_COORD_POSTULACION',
  COORD_APOYO: 'CORREO_COORD_APOYO',
  COORD_SOLICITUD: 'CORREO_COORD_SOLICITUD',
  COORD_TAMIZAJE_ALTA: 'CORREO_COORD_TAMIZAJE_ALTA',
  COORD_PROPUESTA_ACEPTADA: 'CORREO_COORD_PROPUESTA_ACEPTADA',
  COORD_PROPUESTA_RECHAZADA: 'CORREO_COORD_PROPUESTA_RECHAZADA',
  COORD_ASIGNACION_VENCIDA: 'CORREO_COORD_ASIGNACION_VENCIDA',
  RECORDATORIO_CITA_PROFESIONAL: 'CORREO_RECORDATORIO_CITA_PROFESIONAL',
  RECORDATORIO_CITA_PERSONA: 'CORREO_RECORDATORIO_CITA_PERSONA',
  FALTA_CONSENTIMIENTO: 'CORREO_FALTA_CONSENTIMIENTO',
  PIDE_REPORTE: 'CORREO_PIDE_REPORTE',
  COORD_DOCUMENTOS_RECIBIDOS: 'CORREO_COORD_DOCUMENTOS_RECIBIDOS',
  COORD_POSIBLE_DUPLICADO: 'CORREO_COORD_POSIBLE_DUPLICADO',
  COORD_SLA_ALTA: 'CORREO_COORD_SLA_ALTA',
  TAREA_AGRADECIMIENTO: 'CORREO_TAREA_AGRADECIMIENTO',
  TAREA_ENTREGA_COORD: 'CORREO_TAREA_ENTREGA_COORD',
  COORD_PACIENTE_ADMITIDO: 'CORREO_COORD_PACIENTE_ADMITIDO',
  CONFIRMAR_DISPONIBILIDAD: 'CORREO_CONFIRMAR_DISPONIBILIDAD',
}

/**
 * Sustituye {variables}.
 *
 * Una variable que no se supo se deja visible —{asi}— en vez de borrarla: en
 * un correo que ya salió, un hueco vacío no se puede distinguir de un texto
 * mal escrito, y un `{nombre}` literal canta a la primera revisión.
 */
export { rellenarLinea }

export function rellenar(texto, variables) {
  if (typeof texto !== 'string') return texto

  return texto.replace(/\{(\w+)\}/g, (entero, nombre) => {
    const valor = variables?.[nombre]
    if (valor === undefined) return entero
    return valor === null ? '' : String(valor)
  })
}

function conContenido(texto) {
  return typeof texto === 'string' && texto.trim().length > 0
}

/**
 * Rellena una línea, o la descarta si se quedó sin lo suyo.
 *
 * El código omite líneas enteras cuando el dato no viene: si no hay motivo de
 * rechazo, no imprime «Motivo:» a secas. Una plantilla plana no sabe hacer eso
 * —no tiene condicionales— así que la regla va aquí: si la línea tenía
 * variables y TODAS salieron vacías, la línea no aporta nada y se cae.
 *
 * Es la misma regla que usa el renderizador del portal para los WhatsApp, y
 * por la misma razón: mandar «Motivo:» seguido de nada es peor que no
 * mencionarlo.
 *
 * Una línea sin variables —texto fijo— nunca se descarta: si está escrita, se
 * quiere.
 */
function rellenarLinea(texto, variables) {
  if (typeof texto !== 'string') return null

  const usadas = [...texto.matchAll(/\{(\w+)}/g)].map((m) => m[1])
  if (usadas.length > 0) {
    const algunaConValor = usadas.some((v) => {
      const valor = variables?.[v]
      return valor !== undefined && valor !== null && String(valor).trim() !== ''
    })
    if (!algunaConValor) return null
  }

  const relleno = rellenar(texto, variables)
  return conContenido(relleno) ? relleno : null
}

/**
 * Devuelve el contenido editado en el portal, o null si no hay nada que aplicar.
 *
 * Null en cinco casos, y en los cinco el correo sale con el texto del código:
 * la plantilla no tiene equivalente en el portal, nadie la ha guardado, el
 * JSON está roto, se quedó sin asunto o sin cuerpo, o la consulta falló.
 * Ninguno de ellos puede dejar sin correo a quien está esperando saber que le
 * asignaron un acompañamiento.
 */
export async function contenidoDelPortal(clave, payload) {
  const claveDelPortal = PLANTILLA_DEL_PORTAL[clave]
  if (!claveDelPortal) return null

  let crudo
  try {
    crudo = await SettingsService.getValue(claveDelPortal)
  } catch (error) {
    console.error(`[avisos] no pude leer la plantilla ${claveDelPortal}:`, error.message)
    return null
  }
  if (!crudo) return null

  let plantilla
  try {
    plantilla = typeof crudo === 'string' ? JSON.parse(crudo) : crudo
  } catch {
    // Se guarda como JSON desde una pantalla; si alguien lo dejó inválido, el
    // correo tiene que salir igual.
    console.error(`[avisos] la plantilla ${claveDelPortal} no es JSON válido; uso la del código.`)
    return null
  }
  if (!plantilla || typeof plantilla !== 'object') return null

  const parrafos = Array.isArray(plantilla.parrafos)
    ? plantilla.parrafos.map((p) => rellenarLinea(p, payload)).filter(Boolean)
    : []

  /**
   * Los «datos» son la lista de pares que va bajo los párrafos —«Cuándo: …»,
   * «Modalidad: …»— y también se pueden editar.
   *
   * Se descubrieron comparando: tres de los ocho correos salían sin ese bloque
   * al pasar por el portal, porque el generador solo miraba título, párrafos y
   * botón. La comparación byte a byte lo cazó antes de desplegar nada.
   */
  const datos = Array.isArray(plantilla.datos)
    ? plantilla.datos.map((d) => rellenarLinea(d, payload)).filter(Boolean)
    : []

  const asunto = rellenar(plantilla.asunto, payload)
  if (!conContenido(asunto) || parrafos.length === 0) return null

  return {
    asunto,
    titulo: conContenido(plantilla.titulo) ? rellenar(plantilla.titulo, payload) : null,
    parrafos,
    datos,
    botonTexto: conContenido(plantilla.botonTexto) ? rellenar(plantilla.botonTexto, payload) : null,
  }
}
