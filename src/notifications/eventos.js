import { primerNombre as nombreDePila } from '../nombre.js'
import { NotificationModel } from '../models/notification.model.js'
import { UserModel } from '../models/user.model.js'
import { construir } from './plantillas.js'
import { env } from '../config/env.js'

/**
 * Los avisos que dispara cada cosa que pasa en la red.
 *
 * Todo lo de aquí es "encolar y seguir": ninguna de estas funciones puede
 * hacer fallar la operación que la llamó. Si encolar el aviso falla, se
 * escribe en el log y la persona igual queda registrada, la cita igual queda
 * agendada. Un correo no enviado es un problema; una postulación perdida por
 * un correo no enviado sería otro mucho peor.
 *
 * Misma regla que en el mensaje de WhatsApp: un aviso NUNCA lleva el nombre ni
 * el teléfono de una persona acompañada. Lleva un enlace.
 */

async function encolar({ plantilla, para, nombre, payload, entidad, entidadId, clave }) {
  if (!para) return null

  try {
    const { asunto } = construir(plantilla, payload)

    return await NotificationModel.encolar({
      template: plantilla,
      toEmail: String(para).trim().toLowerCase(),
      toName: nombre ?? null,
      subject: asunto,
      payload,
      entity: entidad ?? null,
      entityId: entidadId ? String(entidadId) : null,
      dedupeKey: clave,
    })
  } catch (error) {
    console.error(`[avisos] no se pudo encolar ${plantilla}:`, error.message)
    return null
  }
}

/**
 * A dónde van los avisos internos de coordinación (solicitudes pendientes,
 * verificaciones pendientes, admisiones, alertas).
 *
 * Siempre incluye el buzón oficial redaquiestamos@gmail.com, además de los
 * correos definidos en NOTIFICACIONES_COORDINACION y las cuentas de administración
 * activas en la base de datos (sin duplicados).
 */
export async function correosDeCoordinacion() {
  const mapa = new Map()

  // 1. Destinatarios configurados por variable de entorno
  if (env.smtp.coordinacion.length > 0) {
    for (const email of env.smtp.coordinacion) {
      if (email) mapa.set(email.toLowerCase(), { email: email.toLowerCase(), name: null })
    }
  } else {
    // Si no hay variable configurada, buzón oficial por defecto
    mapa.set('redaquiestamos@gmail.com', {
      email: 'redaquiestamos@gmail.com',
      name: 'Coordinación Red Aquí Estamos',
    })
  }

  // 2. Administradores activos en la base de datos
  try {
    const admins = await UserModel.findAll?.({ role: 'ADMIN' })
    for (const u of admins ?? []) {
      if (u.active && !u.deletedAt && u.email) {
        mapa.set(u.email.toLowerCase(), { email: u.email.toLowerCase(), name: u.name })
      }
    }
  } catch (error) {
    console.error('[avisos] no se pudo resolver administradores:', error.message)
  }

  // 3. En producción y desarrollo siempre incluir el buzón oficial redaquiestamos@gmail.com
  if (process.env.NODE_ENV !== 'test') {
    mapa.set('redaquiestamos@gmail.com', {
      email: 'redaquiestamos@gmail.com',
      name: 'Coordinación Red Aquí Estamos',
    })
  }

  return Array.from(mapa.values())
}

async function avisarACoordinacion({ plantilla, payload, entidad, entidadId, clave }) {
  const destinos = await correosDeCoordinacion()

  for (const destino of destinos) {
    await encolar({
      plantilla,
      para: destino.email,
      nombre: destino.name,
      payload,
      entidad,
      entidadId,
      // La clave incluye el destinatario: cada persona recibe el suyo una vez.
      clave: `${clave}:${destino.email}`,
    })
  }
}

// ---------------------------------------------------------------------------

/** Alguien se postuló como profesional de psicología. */
export async function postulacionRecibida(voluntario) {
  await encolar({
    plantilla: 'POSTULACION_RECIBIDA',
    para: voluntario.email,
    nombre: voluntario.fullName,
    payload: { nombre: primerNombre(voluntario.fullName) },
    entidad: 'postulacion',
    entidadId: voluntario.id,
    clave: `postulacion-recibida:${voluntario.id}`,
  })

  await avisarACoordinacion({
    plantilla: 'COORD_POSTULACION',
    payload: {
      nombre: voluntario.fullName,
      ciudad: voluntario.city ?? 'sin especificar',
      profesion: voluntario.profession || null,
    },
    entidad: 'postulacion',
    entidadId: voluntario.id,
    clave: `coord-postulacion:${voluntario.id}`,
  })
}

/** Alguien se registró desde otra disciplina. */
export async function apoyoRecibido(colaborador) {
  const disciplina =
    colaborador.discipline === 'Otra' && colaborador.disciplineOther
      ? colaborador.disciplineOther
      : colaborador.discipline

  await encolar({
    plantilla: 'APOYO_RECIBIDO',
    para: colaborador.email,
    nombre: colaborador.fullName,
    payload: { nombre: primerNombre(colaborador.fullName), disciplina },
    entidad: 'colaborador',
    entidadId: colaborador.id,
    clave: `apoyo-recibido:${colaborador.id}`,
  })

  await avisarACoordinacion({
    plantilla: 'COORD_APOYO',
    payload: { nombre: colaborador.fullName, disciplina, ciudad: colaborador.city },
    entidad: 'colaborador',
    entidadId: colaborador.id,
    clave: `coord-apoyo:${colaborador.id}`,
  })
}

/**
 * Entró una solicitud de acompañamiento.
 * Solo se avisa a coordinación, y sin decir quién: hay una persona en crisis
 * detrás y sus datos se miran en el portal, no en una bandeja de correo.
 */
export async function solicitudRecibida(solicitud) {
  await avisarACoordinacion({
    plantilla: 'COORD_SOLICITUD',
    payload: { ciudad: solicitud.city ?? 'sin especificar' },
    entidad: 'solicitud',
    entidadId: solicitud.id,
    clave: `coord-solicitud:${solicitud.id}`,
  })
}

/** Se aprobó una postulación y ya existe la ficha del profesional. */
export async function postulacionAprobada(profesional) {
  await encolar({
    plantilla: 'POSTULACION_APROBADA',
    para: profesional.email,
    nombre: profesional.fullName,
    payload: { nombre: primerNombre(profesional.fullName) },
    entidad: 'profesional',
    entidadId: profesional.id,
    clave: `postulacion-aprobada:${profesional.id}`,
  })
}

/** Solicitar al profesional por correo que suba sus documentos (tarjeta/identidad). */
export async function solicitarDocumentosEmail({ profesional, token }) {
  await encolar({
    plantilla: 'SOLICITUD_DOCUMENTOS_PROFESIONAL',
    para: profesional.email,
    nombre: profesional.fullName,
    payload: {
      nombre: primerNombre(profesional.fullName),
      ruta: `/documentos/${token}`,
    },
    entidad: 'profesional',
    entidadId: profesional.id,
    clave: `solicitar-docs:${profesional.id}:${Date.now()}`,
  })
}

/**
 * Se admitió a alguien y falta asignarle profesional.
 *
 * `sinRespuesta` cambia lo que hay que hacer con ese aviso, no solo cómo se
 * lee: significa que la persona nunca contestó el tamizaje y que la prioridad
 * es una suposición del sistema. A esa hay que llamarla, no solo asignarle
 * profesional.
 */
export async function pacienteAdmitido(paciente, { sinRespuesta = false } = {}) {
  await avisarACoordinacion({
    plantilla: 'COORD_PACIENTE_ADMITIDO',
    payload: {
      prioridad: paciente.priority,
      ciudad: paciente.city,
      sinRespuesta,
      ruta: `/portal/personas/${paciente.id}`,
    },
    entidad: 'paciente',
    entidadId: paciente.id,
    clave: `coord-admitido:${paciente.id}`,
  })
}

/** Se agendó una cita. Avisa al profesional, con enlace y sin datos. */
export async function citaAgendada({ cita, profesional, cuando }) {
  await encolar({
    plantilla: 'CITA_AGENDADA',
    para: profesional.email,
    nombre: profesional.fullName,
    payload: {
      nombre: primerNombre(profesional.fullName),
      cuando,
      modalidad: cita.modality,
      ruta: `/portal/caso/${cita.patientId}`,
    },
    entidad: 'cita',
    entidadId: cita.id,
    clave: `cita-agendada:${cita.id}`,
  })
}

/**
 * El profesional respondió qué pasó con su asignación.
 * Va a quien hizo esa asignación, que es quien está esperando la respuesta.
 */
export async function reporteRecibido({ reporte, asignacion }) {
  const destinatario = asignacion.createdById
    ? await UserModel.findById(asignacion.createdById).catch(() => null)
    : null

  const payload = {
    profesional: asignacion.professional.fullName,
    resultado: reporte.outcome,
    queSigue: reporte.followUp || null,
    dificultades: reporte.contactDifficulties || null,
    ruta: `/portal/personas/${asignacion.patientId}`,
  }

  // Si quien asignó ya no tiene cuenta activa, el aviso no se pierde: pasa a
  // coordinación.
  if (destinatario?.active && !destinatario.deletedAt) {
    await encolar({
      plantilla: 'REPORTE_RECIBIDO',
      para: destinatario.email,
      nombre: destinatario.name,
      payload,
      entidad: 'reporte',
      entidadId: reporte.id,
      clave: `reporte:${reporte.id}:${destinatario.email}`,
    })
    return
  }

  await avisarACoordinacion({
    plantilla: 'REPORTE_RECIBIDO',
    payload,
    entidad: 'reporte',
    entidadId: reporte.id,
    clave: `reporte:${reporte.id}`,
  })
}

// ---------------------------------------------------------------------------

/**
 * En un saludo, el apellido sobra.
 *
 * Usa el `primerNombre` común, pero conserva su propio respaldo: aquí un
 * nombre vacío tiene que seguir siendo un saludo. «Hola,» a secas se lee como
 * un correo roto. Esa diferencia es de este sitio, no del resto, y por eso
 * vive aquí y no en el módulo compartido.
 */
function primerNombre(nombreCompleto) {
  return nombreDePila(nombreCompleto) ?? 'hola'
}

/**
 * La persona respondió el tamizaje y contó algo que no puede esperar.
 *
 * Se dispara por la RESPUESTA, no por la prioridad: la admisión ya manda su
 * propio aviso con la prioridad puesta, y avisar dos veces de lo mismo
 * convierte la bandeja en ruido. Este es el otro asunto —alguien dijo que ha
 * pensado en hacerse daño, o que no tiene dónde estar— y merece un correo que
 * se distinga del "entró alguien nuevo a la cola".
 *
 * Como siempre: el aviso NO dice quién es ni qué respondió. Dice que hay algo
 * urgente y dónde mirarlo. Con datos de salud de por medio eso no es un
 * escrúpulo, es la regla de la red.
 */
export async function tamizajeRespondido({ solicitud, respuesta }) {
  const urgente = respuesta.selfHarmThoughts === true || respuesta.safePlace === false
  if (!urgente) return

  await avisarACoordinacion({
    plantilla: 'COORD_TAMIZAJE_ALTA',
    payload: {
      ciudad: solicitud.city ?? solicitud.place ?? 'sin especificar',
      esMenor: solicitud.isMinor === true,
      ruta: '/portal/solicitudes',
    },
    entidad: 'tamizaje',
    entidadId: respuesta.id,
    clave: `coord-tamizaje-alta:${respuesta.id}`,
  })
}

/**
 * El profesional respondió a un caso que le propusieron.
 *
 * Va a coordinación porque es lo que desbloquea el siguiente paso: si aceptó,
 * hay que cuadrar horario con la persona; si no, hay que proponérselo a otro.
 * Un caso esperando en silencio es la forma más fácil de que alguien lleve
 * dos semanas sin acompañamiento sin que nadie se dé cuenta.
 *
 * Como siempre, el aviso no dice a quién acompaña: lleva un enlace.
 */
/**
 * El barrido liberó una asignación que se murió de silencio. A coordinación,
 * que es quien tiene que proponerle el caso a otro profesional.
 */
export async function asignacionVencida({ asignacion, profesional, tramo }) {
  await avisarACoordinacion({
    plantilla: 'COORD_ASIGNACION_VENCIDA',
    payload: {
      profesional: profesional.fullName,
      tramo,
      ruta: `/portal/personas/${asignacion.patientId}`,
    },
    entidad: 'asignacion',
    entidadId: asignacion.id,
    clave: `coord-vencida:${asignacion.id}`,
  })
}

/**
 * Una prioridad ALTA lleva demasiados días en la cola sin profesional. A
 * coordinación, una sola vez por persona (la dedupeKey lo garantiza).
 */
/**
 * Se admitió a alguien cuyo teléfono ya está en otra ficha activa. A
 * coordinación, para unir en vez de duplicar: dos fichas de la misma persona
 * son dos profesionales llamando al mismo teléfono.
 */
/** El profesional subió sus documentos por su enlace. A coordinación, a aprobar. */
export async function documentosRecibidos({ profesional }) {
  await avisarACoordinacion({
    plantilla: 'COORD_DOCUMENTOS_RECIBIDOS',
    payload: {
      profesional: profesional.fullName,
      ruta: '/portal/verificaciones',
    },
    entidad: 'profesional',
    entidadId: profesional.id,
    clave: `documentos:${profesional.id}:${profesional.documentsSubmittedAt?.toISOString?.() ?? 'x'}`,
  })
}

export async function avisoPosibleDuplicado({ nueva, existente }) {
  await avisarACoordinacion({
    plantilla: 'COORD_POSIBLE_DUPLICADO',
    payload: {
      ciudad: nueva.city,
      rutaNueva: `/portal/personas/${nueva.id}`,
      rutaExistente: `/portal/personas/${existente.id}`,
    },
    entidad: 'paciente',
    entidadId: nueva.id,
    clave: `duplicado:${nueva.id}`,
  })
}

export async function avisoSlaAlta({ paciente, dias }) {
  await avisarACoordinacion({
    plantilla: 'COORD_SLA_ALTA',
    payload: {
      ciudad: paciente.city,
      dias,
      ruta: `/portal/personas/${paciente.id}`,
    },
    entidad: 'paciente',
    entidadId: paciente.id,
    clave: `sla-alta:${paciente.id}`,
  })
  return true
}

export async function propuestaRespondida({ asignacion, profesional }) {
  await avisarACoordinacion({
    plantilla: asignacion.status === 'ACEPTADA' ? 'COORD_PROPUESTA_ACEPTADA' : 'COORD_PROPUESTA_RECHAZADA',
    payload: {
      profesional: profesional.fullName,
      nota: asignacion.availabilityNote || null,
      motivo: asignacion.declineReason || null,
      ruta: `/portal/personas/${asignacion.patientId}`,
    },
    entidad: 'asignacion',
    entidadId: asignacion.id,
    clave: `coord-propuesta:${asignacion.id}:${asignacion.status}`,
  })
}

// ---------------------------------------------------------------------------
// Módulo de Tareas Internas
// ---------------------------------------------------------------------------

/** Se asignó la tarea a un voluntario. Le llega a él para que acepte o rechace. */
export async function tareaAsignada({ asignacion, tarea, colaborador, ruta }) {
  await encolar({
    plantilla: 'TAREA_INVITACION',
    para: colaborador.email,
    nombre: colaborador.fullName,
    payload: {
      nombre: primerNombre(colaborador.fullName),
      titulo: tarea.title,
      descripcion: tarea.description ?? null,
      nota: asignacion.note ?? null,
      fechaLimite: tarea.dueDate
        ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(tarea.dueDate))
        : null,
      ruta,
    },
    entidad: 'task_assignment',
    entidadId: asignacion.id,
    clave: `tarea-invitacion:${asignacion.id}`,
  })
}

/** El voluntario respondió (aceptó o rechazó). Le llega a coordinación. */
export async function tareaRespondida({ asignacion, tarea, colaborador }) {
  await avisarACoordinacion({
    plantilla: 'TAREA_RESPUESTA',
    payload: {
      nombreVoluntario: colaborador.fullName,
      titulo: tarea.title,
      accion: asignacion.status,
      motivoRechazo: asignacion.declineReason ?? null,
      ruta: `/portal/colaboradores/tareas/${tarea.id}`,
    },
    entidad: 'task_assignment',
    entidadId: asignacion.id,
    clave: `tarea-respondida:${asignacion.id}`,
  })
}


/** El voluntario completó la tarea. Se le agradece a él y se avisa a coordinación. */
export async function tareaCompletada({ asignacion, tarea, colaborador, porVoluntario = false }) {
  // Agradecimiento al voluntario
  await encolar({
    plantilla: 'TAREA_AGRADECIMIENTO',
    para: colaborador.email,
    nombre: colaborador.fullName,
    payload: {
      nombre: primerNombre(colaborador.fullName),
      titulo: tarea.title,
    },
    entidad: 'task_assignment',
    entidadId: asignacion.id,
    clave: `tarea-gracias:${asignacion.id}`,
  })

  // Si la marcó el propio voluntario desde su link, avisar a coordinación
  if (porVoluntario) {
    await avisarACoordinacion({
      plantilla: 'TAREA_ENTREGA_COORD',
      payload: {
        nombreVoluntario: colaborador.fullName,
        titulo: tarea.title,
        completionUrl: asignacion.completionUrl ?? null,
        completionNote: asignacion.completionNote ?? null,
        ruta: `/portal/tareas/${tarea.id}`,
      },
      entidad: 'task_assignment',
      entidadId: asignacion.id,
      clave: `tarea-entrega:${asignacion.id}`,
    })
  }
}

/**
 * Pedirle al profesional que confirme que su agenda sigue al día.
 *
 * La clave de deduplicación lleva el mes: así se manda como mucho uno por
 * profesional y por mes, aunque el barrido corra veinte veces —o aunque el
 * servidor se reinicie— sin necesidad de recordar a quién ya se le escribió.
 */
export async function pedirConfirmacionDeDisponibilidad({ profesional, agenda, desdeCuando, ruta }) {
  const mes = new Date().toISOString().slice(0, 7)

  await encolar({
    plantilla: 'CONFIRMAR_DISPONIBILIDAD',
    para: profesional.email,
    nombre: profesional.fullName,
    payload: {
      nombre: primerNombre(profesional.fullName),
      agenda: agenda || 'no tienes horarios cargados',
      desdeCuando,
      ruta,
    },
    entidad: 'profesional',
    entidadId: profesional.id,
    clave: `confirmar-disponibilidad:${profesional.id}:${mes}`,
  })
}
