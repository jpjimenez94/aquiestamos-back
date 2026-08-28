import { enPalabras } from '../services/timezone.service.js'
import { envolver, envolverTexto, urlDelSitio } from './envoltura.js'
import {
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_RESULTADO,
  ETIQUETAS_QUE_SIGUE,
  ETIQUETAS_DIA,
  ETIQUETAS_FRANJA,
} from '../catalogos.js'

/**
 * Las plantillas de los avisos.
 *
 * Cada una recibe el `payload` que se guardó al encolar el aviso y devuelve
 * asunto, HTML y texto. El payload es lo que se guarda en la base, así que
 * vale la misma regla que para el mensaje de WhatsApp:
 *
 *   NUNCA lleva el nombre ni el teléfono de una persona acompañada.
 *
 * Un aviso lleva un enlace; quien tenga que ver esos datos entra por ahí y se
 * identifica. Hay una prueba que falla si alguien mete un teléfono.
 */


function armar(asunto, contenido) {
  return {
    asunto,
    html: envolver(contenido),
    texto: envolverTexto(contenido),
  }
}

export const PLANTILLAS = {
  // ---------------------------------------------------------------- acuses

  /** A quien se acaba de postular como profesional de psicología. */
  POSTULACION_RECIBIDA: (p) =>
    armar('Recibimos tu postulación', {
      titulo: `Gracias por sumarte, ${p.nombre}`,
      parrafos: [
        'Recibimos tu postulación a la red de acompañamiento. Vamos a revisarla y te escribimos en cuanto tengamos una respuesta.',
        'Mientras tanto no tienes que hacer nada. Si necesitas corregir algo de lo que enviaste, respóndenos por WhatsApp y lo ajustamos.',
      ],
    }),

  /** A quien se acaba de registrar desde otra disciplina. */
  APOYO_RECIBIDO: (p) =>
    armar('Quedaste en el directorio de la red', {
      titulo: `Gracias por sumarte, ${p.nombre}`,
      parrafos: [
        `Quedaste registrado en el voluntariado de apoyo como <strong>${p.disciplina}</strong>.`,
        'Esto no te compromete a nada. Cuando aparezca una necesidad que encaje con lo que sabes hacer, te buscamos y te escribimos.',
      ],
    }),

  // ------------------------------------------------------------ decisiones

  /** Al profesional cuya postulación se aprobó. */
  POSTULACION_APROBADA: (p) =>
    armar('Tu postulación fue aprobada', {
      titulo: `Bienvenido a la red, ${p.nombre}`,
      parrafos: [
        'Tu postulación quedó aprobada. Ya haces parte de la red de acompañamiento.',
        'Cuando te asignemos un acompañamiento te vamos a escribir por WhatsApp con un enlace. Ahí verás los datos de la persona —entrando con este mismo correo— y desde ahí mismo nos cuentas cómo te fue.',
        'No tienes que crear ninguna contraseña: el enlace y tu correo son suficientes.',
      ],
    }),

  /** Al profesional solicitándole que cargue sus documentos de soporte. */
  SOLICITUD_DOCUMENTOS_PROFESIONAL: (p) =>
    armar('Carga de documentos para tu perfil · Red Aquí Estamos', {
      titulo: `Hola ${p.nombre}, completa tu perfil`,
      parrafos: [
        'Para completar la activación de tu perfil y poder asignarte acompañamientos psicológicos en la red, necesitamos que cargues tu tarjeta profesional (o certificado de estudios si estás en formación) y tu documento de identidad.',
        'Puedes cargarlos en cualquier momento desde tu teléfono o computador ingresando al enlace personal y seguro a continuación. Los documentos se almacenan de manera protegida en nuestro almacenamiento privado.',
      ],
      boton: { texto: 'Cargar mis documentos', url: urlDelSitio(p.ruta) },
    }),

  // ---------------------------------------------------------------- agenda

  /**
   * Al profesional cuando se le agenda una cita.
   * Sin nombre ni teléfono: el enlace es el que abre esos datos.
   */
  CITA_AGENDADA: (p) =>
    armar('Te agendamos una cita', {
      titulo: 'Tienes una cita agendada',
      parrafos: [
        `Hola ${p.nombre}, te agendamos un acompañamiento.`,
        'Los datos de contacto de la persona están en el enlace de abajo. Entras con este mismo correo.',
      ],
      datos: [
        `<strong>Cuándo:</strong> ${p.cuando}`,
        `<strong>Modalidad:</strong> ${String(p.modalidad ?? '').toLowerCase()}`,
      ],
      boton: { texto: 'Ver el caso', url: urlDelSitio(p.ruta) },
    }),

  /** Al agendador que hizo la asignación, cuando el profesional responde. */
  REPORTE_RECIBIDO: (p) =>
    armar(`Respuesta sobre un caso: ${ETIQUETAS_RESULTADO[p.resultado] ?? p.resultado}`, {
      titulo: 'El profesional respondió',
      parrafos: [
        `<strong>${p.profesional}</strong> nos contó qué pasó con un caso que tú asignaste.`,
      ],
      datos: [
        `<strong>Respondió:</strong> ${ETIQUETAS_RESULTADO[p.resultado] ?? p.resultado}`,
        // La línea que decide: con esto se agenda la siguiente o se cierra.
        p.queSigue ? `<strong>Qué sigue:</strong> ${ETIQUETAS_QUE_SIGUE[p.queSigue] ?? p.queSigue}` : null,
        p.dificultades ? `<strong>Dificultades:</strong> ${p.dificultades}` : null,
      ].filter(Boolean),
      boton: { texto: 'Ver el caso en el portal', url: urlDelSitio(p.ruta) },
    }),

  // ------------------------------------------------------------ internos

  /** A coordinación: llegó una postulación nueva. */
  COORD_POSTULACION: (p) =>
    armar('Nueva postulación de profesional', {
      titulo: 'Llegó una postulación',
      parrafos: ['Hay una postulación nueva esperando revisión.'],
      datos: [
        `<strong>Quién:</strong> ${p.nombre}`,
        `<strong>Ciudad:</strong> ${p.ciudad}`,
        p.profesion ? `<strong>Profesión:</strong> ${p.profesion}` : null,
      ].filter(Boolean),
      boton: { texto: 'Ver las postulaciones', url: urlDelSitio('/portal/postulaciones') },
    }),

  /** A coordinación: alguien se registró desde otra disciplina. */
  COORD_APOYO: (p) =>
    armar('Nuevo voluntariado de apoyo', {
      titulo: 'Alguien se sumó desde otra disciplina',
      parrafos: ['Hay un registro nuevo en el directorio de voluntariado de apoyo.'],
      datos: [
        `<strong>Quién:</strong> ${p.nombre}`,
        `<strong>Disciplina:</strong> ${p.disciplina}`,
        `<strong>Ciudad:</strong> ${p.ciudad}`,
      ],
      boton: { texto: 'Ver el directorio', url: urlDelSitio('/portal/colaboradores') },
    }),

  /**
   * A coordinación: entró una solicitud de acompañamiento.
   * Aquí sí hay una persona en crisis detrás, así que el aviso no dice quién
   * es: solo que llegó una y dónde mirarla.
   */
  COORD_SOLICITUD: (p) =>
    armar('Nueva solicitud de acompañamiento', {
      titulo: 'Llegó una solicitud',
      parrafos: [
        'Entró una solicitud de acompañamiento por el formulario público.',
        'Los datos de la persona están en el portal. Este correo no los incluye a propósito.',
      ],
      datos: [`<strong>Desde:</strong> ${p.ciudad}`],
      boton: { texto: 'Ver las solicitudes', url: urlDelSitio('/portal/solicitudes') },
    }),

  /**
   * A coordinación: alguien respondió el tamizaje y salió ALTA.
   *
   * Este es el aviso más urgente que manda el sistema, y por eso mismo es el
   * que menos cuenta: detrás puede haber alguien que dijo que ha pensado en
   * hacerse daño. Eso no viaja por correo. Va el enlace, y quien tenga que
   * verlo entra al portal y se identifica.
   */
  COORD_TAMIZAJE_ALTA: (p) =>
    armar('URGENTE · alguien necesita acompañamiento hoy', {
      titulo: 'Hay una solicitud de prioridad alta',
      parrafos: [
        'Una persona respondió las preguntas previas y sus respuestas la ponen en prioridad alta.',
        'Los datos y el motivo están en el portal. Este correo no los incluye a propósito.',
      ],
      datos: [
        `<strong>Desde:</strong> ${p.ciudad}`,
        p.esMenor ? '<strong>Es menor de edad.</strong>' : null,
      ].filter(Boolean),
      boton: { texto: 'Ver la solicitud', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: el profesional aceptó y dejó sus horarios. */
  COORD_PROPUESTA_ACEPTADA: (p) =>
    armar('Un profesional acepto un caso · falta cuadrar horario', {
      titulo: 'Aceptó, y ya dijo cuándo puede',
      parrafos: [
        `<strong>${p.profesional}</strong> acepta acompañar un caso que le propusiste.`,
        'Ya puedes escribirle a la persona con estos horarios y cuadrar uno. Hasta que no se cuadre, el caso sigue esperando.',
      ],
      datos: [
        `<strong>Puede:</strong> ${(p.dias ?? []).map((d) => ETIQUETAS_DIA[d] ?? d).join(', ') || 'sin especificar'}`,
        `<strong>Franjas:</strong> ${(p.franjas ?? []).map((f) => ETIQUETAS_FRANJA[f] ?? f).join(', ') || 'sin especificar'}`,
        p.nota ? `<strong>Además dijo:</strong> ${p.nota}` : null,
      ].filter(Boolean),
      boton: { texto: 'Cuadrar el horario', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: el profesional no puede. Hay que buscarle otro. */
  COORD_PROPUESTA_RECHAZADA: (p) =>
    armar('Un profesional no pudo tomar un caso', {
      titulo: 'Hay que proponérselo a otro',
      parrafos: [
        `<strong>${p.profesional}</strong> no puede tomar un caso que le propusiste.`,
        'La persona vuelve a la cola de pendientes por asignar. Cuanto antes se le proponga a alguien más, menos espera.',
      ],
      datos: [p.motivo ? `<strong>Dijo:</strong> ${p.motivo}` : null].filter(Boolean),
      boton: { texto: 'Buscarle otro profesional', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: el barrido liberó una asignación vencida por silencio. */
  COORD_ASIGNACION_VENCIDA: (p) =>
    armar('Un caso volvió a la cola por falta de respuesta', {
      titulo: 'Hay que proponérselo a otro profesional',
      parrafos: [
        p.tramo === 'profesional'
          ? `<strong>${p.profesional}</strong> no respondió a la propuesta a tiempo, así que el sistema liberó el caso.`
          : `La persona no confirmó horario con <strong>${p.profesional}</strong> a tiempo, así que el sistema liberó el caso.`,
        'El cupo del profesional quedó libre y la persona volvió a la cola de pendientes por asignar.',
      ],
      boton: { texto: 'Buscarle otro profesional', url: urlDelSitio(p.ruta) },
    }),

  // ------------------------------------------------------------- citas (barrido)

  /** Fecha ISO → «lunes 25 de agosto, 7:30 p. m.» en hora de Bogotá. */
  RECORDATORIO_CITA_PROFESIONAL: (p) =>
    armar(`Recordatorio: tienes sesión ${enPalabras(p.cuando)}`, {
      titulo: `Hola ${p.nombre}, tu sesión se acerca`,
      parrafos: [
        `Te recordamos que tienes una sesión de acompañamiento <strong>${enPalabras(p.cuando)}</strong> (${String(p.modalidad ?? '').toLowerCase()}).`,
        'Los datos de contacto de la persona están en tu enlace del caso, como siempre.',
      ],
      boton: { texto: 'Abrir mi caso', url: urlDelSitio(p.ruta) },
    }),

  RECORDATORIO_CITA_PERSONA: (p) =>
    armar(`Recordatorio: tu acompañamiento es ${enPalabras(p.cuando)}`, {
      titulo: `Hola ${p.nombre}, tu espacio se acerca`,
      parrafos: [
        `Te recordamos tu sesión de acompañamiento con <strong>${p.profesional}</strong>: <strong>${enPalabras(p.cuando)}</strong> (${String(p.modalidad ?? '').toLowerCase()}).`,
        `${p.profesional} se pondrá en contacto contigo para ese momento. No tienes que hacer nada más.`,
        'Si te surge algo y no puedes, respóndenos por WhatsApp con tiempo y lo movemos. No pasa nada.',
        'Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes: llama al 123 (emergencias) o al 106 (salud mental). Son gratuitas y atienden a toda hora.',
      ],
    }),

  /** Al profesional, un rato después de la hora de la sesión. */
  PIDE_REPORTE: (p) =>
    armar('¿Cómo te fue? Cuéntanos desde tu enlace', {
      titulo: `Hola ${p.nombre}, pasó la hora de tu sesión`,
      parrafos: [
        `Tu sesión estaba agendada para ${enPalabras(p.cuando)}. Entra a tu enlace del caso y cuéntanos tres cosas: si se pudo hacer, cómo te fue, y si crees que la persona necesita más sesiones o con esta fue suficiente.`,
        'Con eso cerramos esta cita y cuadramos la siguiente si hace falta, sin tener que escribirte a preguntar.',
      ],
      boton: { texto: 'Contar cómo me fue', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: llegaron documentos de un profesional, a aprobar. */
  COORD_DOCUMENTOS_RECIBIDOS: (p) =>
    armar('Documentos recibidos: hay una verificación pendiente', {
      titulo: 'Un profesional subió sus documentos',
      parrafos: [
        `<strong>${p.profesional}</strong> subió su tarjeta (o certificado) y su documento de identidad por su enlace.`,
        'Están en la pantalla de verificaciones, con el documento a la vista y los datos del perfil al lado, para aprobar en un clic.',
      ],
      boton: { texto: 'Revisar y aprobar', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: algo falló en el servidor. Uno por error y por día. */
  COORD_ERROR: (p) =>
    armar(`Error en la plataforma: ${p.origen}`, {
      titulo: 'Algo falló en el servidor',
      parrafos: [
        'La plataforma registró un error. Si los correos de este tipo se repiten en días distintos, hay que mirarlo con quien desarrolla.',
      ],
      datos: [
        `<strong>Dónde:</strong> ${p.origen}`,
        `<strong>Mensaje:</strong> ${p.mensaje}`,
        p.donde ? `<strong>Rastro:</strong> ${p.donde}` : null,
      ].filter(Boolean),
    }),

  /** A coordinación: el teléfono de una admisión ya existe en otra ficha. */
  COORD_POSIBLE_DUPLICADO: (p) =>
    armar('Posible ficha duplicada', {
      titulo: 'El mismo teléfono está en dos fichas',
      parrafos: [
        `Se admitió a una persona en ${p.ciudad} cuyo teléfono ya aparece en otra ficha activa. Puede ser la misma persona pidiendo ayuda dos veces.`,
        'Revisa las dos y, si son la misma, cierra una con motivo: dos fichas de la misma persona son dos profesionales llamando al mismo teléfono.',
      ],
      datos: [
        `<strong>Ficha nueva:</strong> ${urlDelSitio(p.rutaNueva)}`,
        `<strong>Ficha existente:</strong> ${urlDelSitio(p.rutaExistente)}`,
      ],
    }),

  /** A coordinación: una ALTA lleva días en la cola sin profesional. */
  COORD_SLA_ALTA: (p) =>
    armar(`Prioridad ALTA sin asignar hace ${p.dias} días`, {
      titulo: 'Un caso urgente se está quedando en la cola',
      parrafos: [
        `Una persona admitida con <strong>prioridad alta</strong> en ${p.ciudad} lleva <strong>${p.dias} días</strong> sin profesional asignado.`,
        'Cuanto antes se le proponga a alguien, menos espera quien peor está.',
      ],
      boton: { texto: 'Buscarle profesional', url: urlDelSitio(p.ruta) },
    }),

  /** Al voluntario: el coordinador le asignó una tarea. */
  TAREA_INVITACION: (p) =>
    armar(`[Aquí Estamos] Te necesitamos para una tarea: ${p.titulo}`, {
      titulo: `Hola ${p.nombre}, ¿puedes apoyarnos?`,
      parrafos: [
        `El equipo de coordinación de la Red Aquí Estamos te está invitando a apoyar con la siguiente tarea:`,
        `<strong>${p.titulo}</strong>`,
        p.descripcion ?? null,
        p.nota ? `<em>Nota del coordinador:</em> ${p.nota}` : null,
        p.fechaLimite ? `<strong>Fecha límite:</strong> ${p.fechaLimite}` : null,
        'Haz clic abajo para ver los detalles y confirmar si puedes apoyarnos. Si no puedes en este momento, también puedes declinarlo desde el mismo enlace.',
      ].filter(Boolean),
      boton: { texto: 'Ver tarea y confirmar', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: el voluntario respondió a una asignación. */
  
  /** Al voluntario: agradecimiento por completar la tarea. */
  TAREA_AGRADECIMIENTO: (p) =>
    armar(`[Aquí Estamos] ¡Muchas gracias por tu apoyo con "${p.titulo}"!`, {
      titulo: `¡Muchas gracias, ${p.nombre}!`,
      parrafos: [
        `Queremos agradecerte de corazón por tu valiosa colaboración en la labor <strong>${p.titulo}</strong>.`,
        'Gracias a tu tiempo y disciplina, el equipo de la Red Aquí Estamos puede seguir brindando acompañamiento oportuno y de calidad a quienes más lo necesitan.',
        'Pronto te contactaremos cuando tengamos nuevas iniciativas en las que puedas seguir aportando tu talento.',
      ],
      boton: { texto: 'Conoce más sobre la Red', url: urlDelSitio('/recursos') },
    }),

  /** A coordinación: el voluntario marcó la tarea como completada y entregó reporte/link. */
  TAREA_ENTREGA_COORD: (p) =>
    armar(`Entrega de labor completada: ${p.nombreVoluntario} — ${p.titulo}`, {
      titulo: 'Un voluntario completó su labor',
      parrafos: [
        `<strong>${p.nombreVoluntario}</strong> marcó como completada la tarea <strong>${p.titulo}</strong>.`,
      ],
      datos: [
        p.completionUrl ? `<strong>Enlace de entrega:</strong> <a href="${p.completionUrl}">${p.completionUrl}</a>` : null,
        p.completionNote ? `<strong>Comentario del voluntario:</strong> ${p.completionNote}` : null,
      ].filter(Boolean),
      boton: { texto: 'Ver la tarea en el portal', url: urlDelSitio(p.ruta) },
    }),

  TAREA_RESPUESTA: (p) =>
    armar(`Respuesta de voluntario: ${p.accion} — ${p.titulo}`, {
      titulo: 'Un voluntario respondió a una tarea asignada',
      parrafos: [
        `<strong>${p.nombreVoluntario}</strong> respondió a la tarea <strong>${p.titulo}</strong>.`,
      ],
      datos: [
        `<strong>Respuesta:</strong> ${p.accion === 'ACEPTADO' ? '✅ Aceptó apoyar' : '❌ No puede en este momento'}`,
        p.motivoRechazo ? `<strong>Motivo:</strong> ${p.motivoRechazo}` : null,
      ].filter(Boolean),
      boton: { texto: 'Ver la tarea en el portal', url: urlDelSitio(p.ruta) },
    }),

  /** A coordinación: se admitió a alguien y falta asignarle profesional. */
  COORD_PACIENTE_ADMITIDO: (p) =>
    armar(
      p.sinRespuesta
        ? 'Persona admitida sin haber respondido · hay que llamarla'
        : `Persona admitida · prioridad ${(ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad).toLowerCase()}`,
      {
        titulo: 'Hay alguien esperando profesional',
        parrafos: [
          'Se admitió una solicitud y está pendiente de que se le asigne profesional.',
          // Esto cambia lo que hay que hacer, no solo el tono: la prioridad de
          // esta persona no la dijo ella, la supuso el sistema.
          p.sinRespuesta
            ? 'Nunca respondió las preguntas, así que la entramos igual para que no se quedara fuera de la cola. <strong>No sabemos cómo está</strong>: la prioridad de abajo es una suposición. Vale la pena llamarla antes de asignarle a alguien.'
            : null,
        ].filter(Boolean),
        datos: [
          `<strong>Prioridad:</strong> ${ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad}${
            p.sinRespuesta ? ' (supuesta, no respondió)' : ''
          }`,
          `<strong>Ciudad:</strong> ${p.ciudad}`,
        ],
        boton: { texto: 'Buscarle profesional', url: urlDelSitio(p.ruta) },
      },
    ),
}

export function existePlantilla(clave) {
  return Object.prototype.hasOwnProperty.call(PLANTILLAS, clave)
}

export function construir(clave, payload) {
  const plantilla = PLANTILLAS[clave]
  if (!plantilla) throw new Error(`No existe la plantilla de aviso "${clave}"`)
  return plantilla(payload)
}
