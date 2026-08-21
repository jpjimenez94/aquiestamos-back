import { envolver, envolverTexto, urlDelSitio } from './envoltura.js'
import { ETIQUETAS_PRIORIDAD, ETIQUETAS_RESULTADO } from '../catalogos.js'

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

  /** A coordinación: se admitió a alguien y falta asignarle profesional. */
  COORD_PACIENTE_ADMITIDO: (p) =>
    armar(
      `Persona admitida · prioridad ${(ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad).toLowerCase()}`,
      {
        titulo: 'Hay alguien esperando profesional',
        parrafos: ['Se admitió una solicitud y está pendiente de que se le asigne profesional.'],
        datos: [
          `<strong>Prioridad:</strong> ${ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad}`,
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
