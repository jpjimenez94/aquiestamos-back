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
    /**
     * El contenido en crudo, para poder rehacerlo con otro texto.
     *
     * Hace falta por el botón: su URL la calcula el código a partir del
     * payload, y al reescribir el cuerpo desde el portal hay que conservarla.
     * Sin esto, un correo con texto editado perdería el enlace y llegaría
     * diciéndole a alguien que entrara a un sitio sin decirle cuál.
     */
    contenido,
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
        // La sala, para no depender de que alguien la mande por WhatsApp.
        p.sala ? `<strong>Sala virtual:</strong> <a href="${p.sala}">${p.sala}</a>` : null,
      ].filter(Boolean),
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
        // La frase ya redactada, o nada. Una plantilla plana no sabe decidir
        // si una línea sobra; lo que sí sabe es caerse cuando llega vacía.
        p.avisoMenor ?? (p.esMenor ? '<strong>Es menor de edad.</strong>' : null),
      ].filter(Boolean),
      boton: { texto: 'Ver la solicitud', url: urlDelSitio(p.ruta) },
    }),

  /**
   * A coordinación: el profesional confirmó que puede.
   *
   * Pedía `dias` y `franjas` y nadie se los pasaba: esos campos se quitaron del
   * dominio a propósito cuando la agenda del profesional pasó a ser la única
   * fuente de cuándo puede. El correo salía siempre con «Puede: sin
   * especificar» y «Franjas: sin especificar», dos líneas que solo servían para
   * hacer dudar a quien las leía. Y el fixture de la prueba se los inventaba,
   * así que estaba en verde sobre un payload que producción nunca genera.
   *
   * Lo que sí dice algo es la nota —el matiz que él escribe con sus palabras—
   * y el enlace: la persona elige de su agenda real, así que no hay horarios
   * que transcribir.
   */
  COORD_PROPUESTA_ACEPTADA: (p) =>
    armar('Un profesional confirmó un caso', {
      titulo: 'Confirmó que puede tomarlo',
      parrafos: [
        `<strong>${p.profesional}</strong> confirmó que puede acompañar un caso que le asignaste.`,
        'La persona elige la hora de su agenda. Si todavía no le has mandado su enlace, es el momento.',
      ],
      datos: [p.nota ? `<strong>Además dijo:</strong> ${p.nota}` : null].filter(Boolean),
      boton: { texto: 'Ver el caso', url: urlDelSitio(p.ruta) },
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
        // Ramifica por tramo, y una plantilla del portal no puede: la
        // explicación llega ya escrita desde el barrido, que es quien sabe
        // cuál de los dos silencios fue.
        p.explicacion ??
        (p.tramo === 'profesional'
          ? `<strong>${p.profesional}</strong> no respondió a la propuesta a tiempo, así que el sistema liberó el caso.`
          /**
           * Decía «La persona no confirmó horario». El sistema no sabe eso.
           *
           * Desde que asignar dejó de pedir permiso, el reloj de este tramo
           * arranca al asignar, y al profesional se le avisa a mano. Así que un
           * caso puede vencer porque ella no eligió hora, o porque a él nunca
           * le llegó el mensaje. Culpar a la persona en un correo que nadie va
           * a contrastar convierte una duda en un dato falso.
           */
          : `Nadie agendó la sesión con <strong>${p.profesional}</strong> a tiempo, así que el sistema liberó el caso. Puede que ella no eligiera hora, o que él nunca recibiera el aviso.`),
        'El cupo del profesional quedó libre y la persona volvió a la cola de pendientes por asignar.',
      ],
      boton: { texto: 'Buscarle otro profesional', url: urlDelSitio(p.ruta) },
    }),

  // ------------------------------------------------------------- citas (barrido)

  /**
   * La fecha en palabras y la modalidad en minúscula viajan ya hechas.
   *
   * `enPalabras()` convierte un ISO en «lunes 25 de agosto, 7:30 p. m.» y
   * `.toLowerCase()` deja «virtual» en vez de «VIRTUAL». Una plantilla plana no
   * sabe hacer ninguna de las dos, así que al conectar estos correos al portal
   * saldrían con el ISO crudo y la modalidad gritando — exactamente el fallo que
   * ya tuvo `TAREA_RESPUESTA`.
   *
   * Los `??` son para quien siga llamando con el payload viejo: pruebas y
   * scripts a mano.
   */
  RECORDATORIO_CITA_PROFESIONAL: (p) => {
    const cuando = p.cuandoLargo ?? enPalabras(p.cuando)
    const modalidad = p.modalidadLegible ?? String(p.modalidad ?? '').toLowerCase()
    return armar(`Recordatorio: tienes sesión ${cuando}`, {
      titulo: `Hola ${p.nombre}, tu sesión se acerca`,
      parrafos: [
        `Te recordamos que tienes una sesión de acompañamiento <strong>${cuando}</strong> (${modalidad}).`,
        'Los datos de contacto de la persona están en tu enlace del caso, como siempre.',
      ],
      boton: { texto: 'Abrir mi caso', url: urlDelSitio(p.ruta) },
    })
  },

  RECORDATORIO_CITA_PERSONA: (p) => {
    const cuando = p.cuandoLargo ?? enPalabras(p.cuando)
    const modalidad = p.modalidadLegible ?? String(p.modalidad ?? '').toLowerCase()
    return armar(`Recordatorio: tu acompañamiento es ${cuando}`, {
      titulo: `Hola ${p.nombre}, tu espacio se acerca`,
      parrafos: [
        `Te recordamos tu sesión de acompañamiento con <strong>${p.profesional}</strong>: <strong>${cuando}</strong> (${modalidad}).`,
        `${p.profesional} se pondrá en contacto contigo para ese momento. No tienes que hacer nada más.`,
        'Si te surge algo y no puedes, respóndenos por WhatsApp con tiempo y lo movemos. No pasa nada.',
        'Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes: llama al 123 (emergencias) o al 106 (salud mental). Son gratuitas y atienden a toda hora.',
      ],
    })
  },

  /**
   * A la persona, un par de horas después de agendar, si no firmó.
   *
   * Está a un toque de firmar y probablemente se distrajo: de quienes firman,
   * la mediana lo hace en unos veinte minutos. Sin la firma la sesión no
   * puede hacerse, y el espacio del profesional sigue apartado para algo que
   * no va a pasar.
   */
  FALTA_CONSENTIMIENTO: (p) =>
    armar('Te falta un paso para tu sesión', {
      titulo: `Hola ${p.nombre}, quedó pendiente tu consentimiento`,
      parrafos: [
        `Tu sesión con <strong>${p.profesional}</strong> quedó agendada para <strong>${p.cuandoLargo ?? enPalabras(p.cuando)}</strong>.`,
        'Antes de la sesión necesitamos que leas y aceptes el consentimiento. Es corto y se hace desde el celular, en un minuto.',
        'Si cambiaste de opinión o ya no puedes, escríbenos por WhatsApp: movemos la hora o la soltamos, sin problema.',
      ],
      boton: { texto: 'Leer y firmar', url: p.enlace },
    }),

  /** Al profesional, un rato después de la hora de la sesión. */
  PIDE_REPORTE: (p) =>
    armar('¿Cómo te fue? Cuéntanos desde tu enlace', {
      titulo: `Hola ${p.nombre}, pasó la hora de tu sesión`,
      parrafos: [
        `Tu sesión estaba agendada para ${p.cuandoLargo ?? enPalabras(p.cuando)}. Entra a tu enlace del caso y cuéntanos tres cosas: si se pudo hacer, cómo te fue, y si crees que la persona necesita más sesiones o con esta fue suficiente.`,
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
        // Las URL completas, no la ruta: `urlDelSitio` le pega el dominio del
        // entorno, y aplanar eso en una plantilla del portal hornearía
        // «localhost:3000» en el texto que se guarda en la base.
        `<strong>Ficha nueva:</strong> ${p.enlaceNueva ?? urlDelSitio(p.rutaNueva)}`,
        `<strong>Ficha existente:</strong> ${p.enlaceExistente ?? urlDelSitio(p.rutaExistente)}`,
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

  /**
   * Si el voluntario aceptó o no es un HECHO, y viaja ya redactado.
   *
   * Esta plantilla ramificaba aquí con `p.accion === 'ACEPTADO'`. La del portal
   * no sabe ramificar, así que dejó la cadena del rechazo escrita fija — y como
   * el portal manda, el correo salía diciendo «ACEPTADO» en el asunto y «❌ No
   * puede en este momento» en el cuerpo. Coordinación descartaba a quien había
   * dicho que sí.
   *
   * Ahora la frase la calcula quien conoce el estado (`eventos.js`) y llega
   * como variable, de modo que los dos caminos digan lo mismo. Los `??` son
   * para las pruebas y los scripts que construyen el correo pasando solo
   * `accion`.
   */
  TAREA_RESPUESTA: (p) =>
    armar(`Respuesta de voluntario: ${p.accionLegible ?? p.accion} — ${p.titulo}`, {
      titulo: 'Un voluntario respondió a una tarea asignada',
      parrafos: [
        `<strong>${p.nombreVoluntario}</strong> respondió a la tarea <strong>${p.titulo}</strong>.`,
      ],
      datos: [
        `<strong>Respuesta:</strong> ${p.respuesta ?? (p.accion === 'ACEPTADO' ? '✅ Aceptó apoyar' : '❌ No puede en este momento')}`,
        p.motivoRechazo ? `<strong>Motivo:</strong> ${p.motivoRechazo}` : null,
      ].filter(Boolean),
      boton: { texto: 'Ver la tarea en el portal', url: urlDelSitio(p.ruta) },
    }),

  /**
   * A coordinación: se admitió a alguien y falta asignarle profesional.
   *
   * Es la que más ramifica de todas —hasta el asunto cambia— y por eso es la
   * que peor se aplanaría. Las tres piezas que dependen de `sinRespuesta` van
   * ya redactadas en el payload; los `??` sostienen a quien llame con el
   * payload viejo.
   */
  COORD_PACIENTE_ADMITIDO: (p) =>
    armar(
      p.asuntoAdmitida ??
        (p.sinRespuesta
          ? 'Persona admitida sin haber respondido · hay que llamarla'
          : `Persona admitida · prioridad ${(ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad).toLowerCase()}`),
      {
        titulo: 'Hay alguien esperando profesional',
        parrafos: [
          'Se admitió una solicitud y está pendiente de que se le asigne profesional.',
          // Esto cambia lo que hay que hacer, no solo el tono: la prioridad de
          // esta persona no la dijo ella, la supuso el sistema.
          p.avisoSinRespuesta ??
            (p.sinRespuesta
              ? 'Nunca respondió las preguntas, así que la entramos igual para que no se quedara fuera de la cola. <strong>No sabemos cómo está</strong>: la prioridad de abajo es una suposición. Vale la pena llamarla antes de asignarle a alguien.'
              : null),
        ].filter(Boolean),
        datos: [
          `<strong>Prioridad:</strong> ${
            p.prioridadLegible ??
            `${ETIQUETAS_PRIORIDAD[p.prioridad] ?? p.prioridad}${p.sinRespuesta ? ' (supuesta, no respondió)' : ''}`
          }`,
          `<strong>Ciudad:</strong> ${p.ciudad}`,
        ],
        boton: { texto: 'Buscarle profesional', url: urlDelSitio(p.ruta) },
      },
    ),

  /**
   * Al profesional, cada tantos meses: ¿tu agenda sigue como está?
   *
   * Es la condición que hace justo asignar sin preguntar. Desde que ya no se le
   * consulta caso por caso, la agenda de su perfil es lo único que dice cuándo
   * puede — y una cargada hace ocho meses, antes de que cambiara de trabajo,
   * manda a alguien a una hora en la que él no está. Quien se queda esperando
   * es la persona que pidió ayuda.
   *
   * El tono no es de trámite ni de control de asistencia: es un voluntario al
   * que se le agradece y se le pregunta, con la puerta de «ahora no puedo»
   * abierta en la misma frase. Si se siente vigilado, deja de responder — y
   * entonces esto no sirve para nada.
   */
  CONFIRMAR_DISPONIBILIDAD: (p) =>
    armar('¿Tu disponibilidad sigue igual?', {
      titulo: `Hola ${p.nombre}, una pregunta rápida`,
      parrafos: [
        'Cuando te llega un acompañamiento, la persona elige su hora directamente de la agenda que tienes en tu perfil. Por eso te preguntamos de vez en cuando si sigue estando al día.',
        'Si nada cambió, no tienes que hacer nada: con eso nos vale. Si cambió —otro trabajo, otros horarios, o simplemente este no es buen momento— entra y ajústala, o dinos y te dejamos en pausa.',
        'Estar en pausa no es irse de la red. Es no recibir casos hasta que vuelvas a decirnos que sí.',
      ],
      datos: [
        `<strong>Tu agenda hoy:</strong> ${p.agenda}`,
        `<strong>La cargaste:</strong> ${p.desdeCuando}`,
      ],
      boton: { texto: 'Revisar mi disponibilidad', url: urlDelSitio(p.ruta) },
    }),
}

/**
 * Al profesional, cada mes: ¿tu agenda sigue como está?
 *
 * Es la condición que hace justo asignar sin preguntar. Desde que ya no se le
 * consulta caso por caso, la agenda de su perfil es lo único que dice cuándo
 * puede — y una agenda cargada hace ocho meses, cuando cambió de trabajo,
 * manda a alguien a una hora en la que él no está. Quien queda esperando es la
 * persona que pidió ayuda.
 *
 * El tono importa: no es un trámite ni un control de asistencia. Es un
 * voluntario al que se le agradece y se le pregunta, con la puerta de «ahora
 * no puedo» siempre abierta.
 */
export const AVISO_DISPONIBILIDAD = 'CONFIRMAR_DISPONIBILIDAD'

export function existePlantilla(clave) {
  return Object.prototype.hasOwnProperty.call(PLANTILLAS, clave)
}

/**
 * Arma un aviso. Si la coordinación reescribió el texto, gana el suyo.
 *
 * `editado` llega ya resuelto y con las variables puestas. Esto es síncrono a
 * propósito: lo llaman también sitios que solo quieren el asunto para una
 * etiqueta, y no deberían tocar la base por eso. Quien envía de verdad es el
 * despachador, y es él quien lo trae.
 *
 * El envoltorio de la marca, el botón y su URL siguen siendo del código: lo
 * que se edita es lo que se DICE, no a dónde lleva el enlace. Un enlace
 * editable en un correo es una puerta que no queremos abrir.
 */
export function construir(clave, payload, editado = null) {
  const plantilla = PLANTILLAS[clave]
  if (!plantilla) throw new Error(`No existe la plantilla de aviso "${clave}"`)

  const delCodigo = plantilla(payload)
  if (!editado) return delCodigo

  const boton = delCodigo.contenido?.boton
  return armar(editado.asunto, {
    titulo: editado.titulo ?? delCodigo.contenido?.titulo,
    parrafos: editado.parrafos,
    datos: editado.datos?.length ? editado.datos : delCodigo.contenido?.datos,
    // El botón se conserva entero y solo se le cambia el texto: la URL la
    // calcula el código a partir del payload y no sale a ninguna pantalla.
    boton: boton ? { ...boton, texto: editado.botonTexto ?? boton.texto } : undefined,
  })
}
