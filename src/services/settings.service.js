import { prisma } from '../config/database.js'

/**
 * Catálogo completo de configuraciones, plantillas de WhatsApp y correos con sus valores exactos de fábrica.
 */
export const DEFAULT_SETTINGS = [
  // =========================================================================
  // CATEGORÍA 1: MENSAJES DE WHATSAPP (14 plantillas operativas)
  // =========================================================================
  {
    key: 'WHATSAPP_TAMIZAJE',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 2 · Tamizaje y preferencias de la persona',
    description: 'Enviado por WhatsApp a quien solicita acompañamiento para que complete el formulario de tamizaje y horarios.',
    dataType: 'TEXTO',
    variables: ['nombre', 'enlace'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

Recibimos tu solicitud de acompañamiento. Gracias por dar este paso: pedir compañía no siempre es fácil. Ya estamos buscando a la persona que va a acompañarte.

Mientras tanto, nos gustaría conocerte un poco mejor para acompañarte bien desde el comienzo. Son *7 preguntas cortas* en nuestro sitio, redaquiestamos.org — se responden en un minuto, tocando una opción en cada una:

{enlace}

No hay respuestas buenas ni malas, y no es una evaluación ni un diagnóstico: lo que respondas queda entre tú y el equipo de la red.

Cuando las respondas, cuéntanos por aquí.

Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes nuestra respuesta: llama al *106* (línea 106) o al *192* (línea 192). Son gratuitas y atienden a toda hora.`,
  },
  {
    key: 'WHATSAPP_PROPUESTA_PROFESIONAL',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 3 · Aviso de caso asignado al profesional',
    description:
      'Enviado al psicólogo cuando se le asigna un acompañamiento. Ya no se le pide permiso y se espera: se le avisa, y si no puede lo dice desde su enlace y el caso pasa a otra persona el mismo día.',
    dataType: 'TEXTO',
    variables: ['profesional', 'ciudad', 'modalidad', 'urgencia', 'enlace'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Te asignamos un acompañamiento:

· La persona está en {ciudad}.
· Prefiere que sea {modalidad}.

{urgencia}

Ella va a elegir la hora directamente de tu agenda, entre los espacios que ya tienes marcados como libres. Cuando lo haga te llega la confirmación con el día, la hora y el enlace de la videollamada.

Aquí ves el caso, entrando con el correo con el que te registraste:
{enlace}

Si en este momento no puedes tomarlo, dilo ahí mismo y se lo pasamos a otra persona hoy. No pasa nada: es voluntario, y decirlo pronto ayuda más que un sí que no llega.

Sus datos de contacto aparecen en esa pantalla. Es un acompañamiento confidencial: te pedimos manejarlo con responsabilidad ética y profesional, y no compartir los datos de la persona con nadie más.

Gracias por tu tiempo.`,
  },
  {
    key: 'WHATSAPP_CUADRAR_HORARIO_PERSONA',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 4 · Enlace de agenda a la persona',
    description:
      'Enviado a la persona en cuanto tiene profesional. Con el enlace elige ella misma la hora, entre las que él tiene libres. El enlace le sirve para todas sus sesiones y sigue funcionando si más adelante la acompaña otra persona.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'enlaceAgenda', 'nota'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

Ya tenemos quién te acompañe: {profesional}, profesional de la red.

*Aquí puedes elegir tú misma la hora que te sirva*, entre las que tiene libres:
{enlaceAgenda}

Guarda ese enlace: te sirve para esta sesión y para las siguientes.

{nota}

Si prefieres, dinos por aquí cuándo puedes y lo cuadramos nosotros. Como te quede más cómodo.`,
  },
  {
    key: 'WHATSAPP_CONFIRMAR_CITA_PERSONA',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Confirmarle la cita a la persona',
    description: 'Mensaje de confirmación a la persona acompañada con fecha, hora, profesional y enlace de videollamada.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'cuando', 'modalidad', 'enlaceReunion'],
    defaultValue: `Listo, {nombre}. Tu acompañamiento quedó agendado.

· *Con:* {profesional}
· *Cuándo:* {cuando}
· *Modalidad:* {modalidad}
· *Enlace de videollamada:* {enlaceReunion}

A la hora acordada, solo debes hacer clic en el enlace de videollamada desde tu celular o computador para unirte a la sesión con {profesional}. No tienes que descargar nada ni registrarte.

Si te surge algo y no puedes, escríbenos por aquí con tiempo y lo movemos. No pasa nada.`,
  },
  {
    key: 'WHATSAPP_CONSENTIMIENTO',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Pedirle la firma del consentimiento',
    description: 'Enviado a la persona acompañada antes de su primera sesión para la firma electrónica del consentimiento informado.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'enlace'],
    defaultValue: `Hola {nombre}, antes de tu sesión con {profesional} te pedimos leer y firmar el consentimiento informado. Es corto y se hace desde cualquier dispositivo en nuestro sitio web oficial:
{enlace}

Es el paso que nos permite empezar: explica cómo funciona el acompañamiento y cómo cuidamos lo que nos cuentes. Te toma un par de minutos.

Si algo no te queda claro, escríbenos por aquí y te lo explicamos con gusto.`,
  },
  {
    key: 'WHATSAPP_CONSENTIMIENTO_FIRMADO',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Avisarle que su consentimiento llegó',
    description: 'Confirmación a la persona de que su consentimiento fue recibido exitosamente y que el profesional la contactará 15 min antes.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'cuando', 'modalidad'],
    defaultValue: `Hola {nombre}, confirmamos que recibimos tu consentimiento informado firmado.

Todo está listo para tu acompañamiento:
· *Con:* {profesional}
· *Cuándo:* {cuando}
· *Modalidad:* {modalidad}

{profesional} se pondrá en contacto contigo unos *15 minutos antes* de la hora acordada para iniciar la sesión. No tienes que hacer nada más.

Si te surge alguna duda o necesitas mover el horario, escríbenos por aquí con tiempo.`,
  },
  {
    key: 'WHATSAPP_DESPACHO_PROFESIONAL',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Entregarle el caso al profesional',
    description: 'Entrega formal del caso al psicólogo con responsabilidades de contacto previo (15 min), puntualidad, enlace al caso y sala virtual.',
    dataType: 'TEXTO',
    variables: ['profesional', 'persona', 'cuando', 'modalidad', 'enlaceReunion', 'canalContacto', 'enlaceCaso'],
    defaultValue: `Hola {profesional}, {persona} ya eligió su hora.

De acuerdo con la disponibilidad que tienes cargada en tu perfil, quedó agendado el acompañamiento:

· *Persona acompañada:* {persona}
· *Cuándo:* {cuando}
· *Modalidad:* {modalidad}
· *Enlace de videollamada:* {enlaceReunion}
· *Canal preferido de la persona:* {canalContacto}
· *Consentimiento informado:* Firmado por la persona

*Tu responsabilidad en este acompañamiento:*
1. Tú das el primer paso: ponte en contacto con ella por {canalContacto} unos *15 minutos antes* de la cita para coordinar el inicio de la sesión en la fecha y hora acordadas. Ella ya sabe que la vas a contactar.
2. Compromiso y puntualidad: la persona te está esperando. Si te surge un imprevisto de fuerza mayor, avísanos de inmediato por aquí para no dejarla esperando y poder reagendar a tiempo.

Los datos de contacto y la información del caso están en tu enlace seguro:
{enlaceCaso}

Al terminar la sesión, entra a ese mismo enlace para registrar el reporte de cierre (si se realizó, cómo fue y si necesita más sesiones).

Por favor *respóndenos a este mensaje confirmando que lo recibiste y lo tienes agendado*.

Gracias por tu compromiso y por acompañar en la red.`,
  },
  {
    key: 'WHATSAPP_SIGUIENTE_CITA_PROFESIONAL',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 7 · Siguiente sesión al profesional',
    description: 'Notificación al profesional de una siguiente sesión agendada para el mismo paciente.',
    dataType: 'TEXTO',
    variables: ['profesional', 'persona', 'cuando', 'modalidad', 'enlaceReunion', 'enlaceCaso'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Quedó agendada tu siguiente sesión de acompañamiento con {persona}:

· *Cuándo:* {cuando}
· *Modalidad:* {modalidad}
· *Enlace de la videollamada:* {enlaceReunion}

*Tu responsabilidad en este acompañamiento:*
1. Tú das el primer paso: ponte en contacto con ella por WhatsApp unos *15 minutos antes* de la cita para coordinar el inicio de la sesión en la fecha y hora acordadas. Ella ya sabe que la vas a contactar.
2. Compromiso y puntualidad: la persona te está esperando. Si te surge un imprevisto de fuerza mayor, avísanos de inmediato por aquí para no dejarla esperando y poder reagendar a tiempo.

Puedes consultar la información del caso en tu enlace seguro:
{enlaceCaso}

Al terminar la sesión, entra a ese mismo enlace para dejarnos tu reporte de seguimiento.

¡Muchas gracias por tu compromiso y tiempo!`,
  },
  {
    key: 'WHATSAPP_RECORDATORIO_PREVIO',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Recordatorio previo al profesional (< 60 min)',
    description: 'Recordatorio enviado 60 minutos o menos antes del inicio de la sesión con responsabilidades y enlace seguro.',
    dataType: 'TEXTO',
    variables: ['profesional', 'cuando', 'modalidad', 'enlaceReunion', 'enlaceCaso'],
    defaultValue: `¡Hola {profesional}! Te saludamos desde la coordinación de la Red Aquí Estamos.

Te recordamos que tienes una sesión de acompañamiento psicológico programada para dentro de poco: *{cuando}* en modalidad *{modalidad}*.

· *Enlace de videollamada:* {enlaceReunion}

*Tu responsabilidad en este acompañamiento:*
1. Tú das el primer paso: ponte en contacto con ella por WhatsApp unos *15 minutos antes* de la cita para coordinar el inicio de la sesión en la fecha y hora acordadas. Ella ya sabe que la vas a contactar.
2. Compromiso y puntualidad: la persona te está esperando. Si te surge un imprevisto de fuerza mayor, avísanos de inmediato por aquí para no dejarla esperando y poder reagendar a tiempo.

Los datos de contacto y la información del caso están en tu enlace seguro:
{enlaceCaso}

Al terminar la sesión, entra a ese mismo enlace para registrar el reporte de cierre (si se realizó, cómo fue y si necesita más sesiones).

Por favor *respóndenos a este mensaje confirmando que lo recibiste y lo tienes agendado*.

¡Muchísimas gracias por tu tiempo, calidez y compromiso solidario!`,
  },
  {
    key: 'WHATSAPP_RECORDATORIO_PREVIO_PERSONA',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 5 · Recordatorio previo a la persona',
    description: 'Recordatorio enviado el día de la cita o en los minutos previos al inicio de la sesión a la persona acompañada.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'cuando', 'modalidad', 'enlaceReunion'],
    defaultValue: `¡Hola {nombre}! Te saludamos de la Red Aquí Estamos.

Te recordamos que tienes tu sesión de acompañamiento con {profesional} programada para dentro de poco: *{cuando}* en modalidad *{modalidad}*.

· *Enlace de videollamada:* {enlaceReunion}

A la hora acordada, solo debes hacer clic en el enlace de videollamada desde tu celular o computador para unirte a la sesión con {profesional}. No tienes que descargar nada ni registrarte.

{profesional} se pondrá en contacto contigo por WhatsApp unos *15 minutos antes* de la hora para coordinar el inicio.

Si te surge un imprevisto y no puedes asistir, por favor escríbenos por aquí con tiempo para avisarle a {profesional} y reprogramar tu espacio.

¡Un abrazo y que tengas una muy buena sesión!`,
  },
  {
    key: 'WHATSAPP_REAGENDAMIENTO_PEDIR_DISP',
    category: 'MENSAJE_WHATSAPP',
    name: 'Mover la sesión (1) · Pedir nueva disponibilidad al profesional',
    description: 'Solicitud al profesional tras un imprevisto para que indique nuevos horarios disponibles.',
    dataType: 'TEXTO',
    variables: ['profesional', 'persona', 'cuandoAnterior', 'enlaceCaso'],
    defaultValue: `Hola {profesional}, te escribimos de la Red Aquí Estamos sobre el caso de {persona}.

Entendemos que te surgió un imprevisto con el horario que teníamos acordado ({cuandoAnterior}). No te preocupes.

Cuéntanos por favor qué otros días y horas tienes disponibles esta o la próxima semana para coordinar con {persona} y dejar la cita reprogramada:
Puedes consultar el caso en tu enlace seguro: {enlaceCaso}

Quedamos muy atentos a tu respuesta para armar la propuesta de horarios. ¡Muchas gracias por tu compromiso!`,
  },
  {
    key: 'WHATSAPP_REAGENDAMIENTO_EXCUSAS',
    category: 'MENSAJE_WHATSAPP',
    name: 'Mover la sesión (2) · Excusas y nuevo espacio a la persona',
    description: 'Mensaje de disculpas a la persona por imprevisto del psicólogo y propuesta de nuevas opciones de agenda.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'motivo', 'cuandoAnterior', 'opcionesHorario'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

Queremos pedirte una disculpa sincera: {profesional} tuvo {motivo} y se le cruza con el horario que teníamos acordado ({cuandoAnterior}).

{profesional} sigue a cargo de tu acompañamiento y está con total disposición de atenderte. Estos son los horarios disponibles para reprogramar tu sesión:
{opcionesHorario}

*¿Cuál de estos espacios te sirve mejor?* Respóndenos por aquí y dejamos la cita reprogramada de una vez. Si ninguno te queda bien, cuéntanos qué otros momentos te sirven y lo coordinamos.

Muchas gracias por tu comprensión y paciencia.`,
  },
  {
    key: 'WHATSAPP_PEDIR_DOCUMENTOS',
    category: 'MENSAJE_WHATSAPP',
    name: 'Documentación · Pedir Tarjeta Profesional / Cédula',
    description: 'Solicitud al psicólogo para cargar su tarjeta profesional y cédula de ciudadanía por enlace seguro.',
    dataType: 'TEXTO',
    variables: ['profesional', 'enlace'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Recibimos tu postulación para acompañar en la red. Gracias por dar este paso: nos alegra contar contigo.

Para dejar tu perfil listo y poder asignarte acompañamientos, nos faltan dos documentos. Es por la seguridad de todos — de quienes acompañan y de quienes son acompañados:
· Si ya eres graduado/a: tu *tarjeta profesional* (foto o PDF).
· Si estás en formación: tu *certificado de estudios* o constancia de matrícula.
· Tu *documento de identidad*.

Los puedes subir en esta página de nuestro sitio, redaquiestamos.org:
{enlace}

Quedan en un almacenamiento privado y cifrado: solo los ve el equipo de la red, y cada consulta queda registrada.

Si este mensaje te genera dudas, respóndenos por aquí antes de abrir el enlace: verificar siempre está bien.

Gracias por tu tiempo.`,
  },
  {
    key: 'WHATSAPP_FEEDBACK_PERSONA',
    category: 'MENSAJE_WHATSAPP',
    name: 'Paso 7 · Encuesta de satisfacción a la persona',
    description: 'Solicitud de retroalimentación de 2 preguntas a la persona acompañada.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'enlace'],
    defaultValue: `Hola {nombre}, te escribimos de Red Aquí Estamos.

Esperamos que tu espacio con {profesional} haya sido útil y seguro para ti.

Nos gustaría conocer brevemente cómo te fue (son *2 preguntas cortas*, toma menos de 1 minuto):
{enlace}

Lo que respondas es *completamente confidencial* y solo lo lee el equipo de coordinación de la red.

¡Muchas gracias por tu tiempo y confianza!`,
  },
  {
    key: 'WHATSAPP_LIDER_COMUNITARIO',
    category: 'MENSAJE_WHATSAPP',
    name: 'Comunidad · Contacto y Articulación con Líder Comunitario',
    description: 'Mensaje de presentación y articulación territorial con líderes de barrio o vereda.',
    dataType: 'TEXTO',
    variables: ['nombre', 'territorio'],
    defaultValue: `¡Hola, {nombre}! Te saludamos con mucho aprecio desde la coordinación de la *Red Aquí Estamos* (red de apoyo psicosocial y atención en crisis).

Nos comunicamos contigo reconociendo tu valioso liderazgo en *{territorio}* y queremos articularnos para apoyar a las familias de tu comunidad.

🤝 *¿Cómo podemos colaborar?*
• Acompañamiento emocional y primeros auxilios psicológicos para las familias.
• Orientación y articulación para la atención de necesidades prioritarias.

¿Cómo se encuentran tú y tu comunidad en este momento? ¿En qué momento te quedaría bien que conversemos unos minutos para coordinar el apoyo?

¡Un abrazo solidario y muchas gracias por tu entrega comunitaria!`,
  },

  // =========================================================================
  // CATEGORÍA 2: PLANTILLAS DE CORREO ELECTRÓNICO (8 plantillas)
  // =========================================================================
  {
    key: 'CORREO_POSTULACION_RECIBIDA',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Acuse de Postulación Recibida',
    description: 'Enviado al psicólogo cuando completa el formulario de postulación a la red.',
    dataType: 'JSON',
    variables: ['nombre'],
    defaultValue: JSON.stringify({
          "asunto": "Recibimos tu postulación",
          "titulo": "Gracias por sumarte, {nombre}",
          "parrafos": [
                "Recibimos tu postulación a la red de acompañamiento. Vamos a revisarla y te escribimos en cuanto tengamos una respuesta.",
                "Mientras tanto no tienes que hacer nada. Si necesitas corregir algo de lo que enviaste, respóndenos por WhatsApp y lo ajustamos."
          ],
          "datos": [],
          "botonTexto": null
    }),
  },
  {
    key: 'CORREO_POSTULACION_APROBADA',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Postulación Aprobada y Bienvenida',
    description: 'Enviado al profesional cuando su perfil es aprobado por el equipo de admisión.',
    dataType: 'JSON',
    variables: ['nombre'],
    defaultValue: JSON.stringify({
          "asunto": "Tu postulación fue aprobada",
          "titulo": "Bienvenido a la red, {nombre}",
          "parrafos": [
                "Tu postulación quedó aprobada. Ya haces parte de la red de acompañamiento.",
                "Cuando te asignemos un acompañamiento te vamos a escribir por WhatsApp con un enlace. Ahí verás los datos de la persona —entrando con este mismo correo— y desde ahí mismo nos cuentas cómo te fue.",
                "No tienes que crear ninguna contraseña: el enlace y tu correo son suficientes."
          ],
          "datos": [],
          "botonTexto": null
    }),
  },
  {
    key: 'CORREO_SOLICITUD_DOCUMENTOS',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Solicitud de Carga de Documentos',
    description: 'Enviado al psicólogo solicitándole cargar su tarjeta profesional y cédula.',
    dataType: 'JSON',
    variables: ['nombre', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Carga de documentos para tu perfil · Red Aquí Estamos",
          "titulo": "Hola {nombre}, completa tu perfil",
          "parrafos": [
                "Para completar la activación de tu perfil y poder asignarte acompañamientos psicológicos en la red, necesitamos que cargues tu tarjeta profesional (o certificado de estudios si estás en formación) y tu documento de identidad.",
                "Puedes cargarlos en cualquier momento desde tu teléfono o computador ingresando al enlace personal y seguro a continuación. Los documentos se almacenan de manera protegida en nuestro almacenamiento privado."
          ],
          "datos": [],
          "botonTexto": "Cargar mis documentos"
    }),
  },
  {
    key: 'CORREO_CITA_AGENDADA',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Notificación de Cita Agendada al Profesional',
    description: 'Aviso por correo al psicólogo con los detalles de fecha y modalidad de una nueva cita.',
    dataType: 'JSON',
    variables: ['nombre', 'cuando', 'modalidad', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Te agendamos una cita",
          "titulo": "Tienes una cita agendada",
          "parrafos": [
                "Hola {nombre}, te agendamos un acompañamiento.",
                "Los datos de contacto de la persona están en el enlace de abajo. Entras con este mismo correo."
          ],
          "datos": [
                "<strong>Cuándo:</strong> {cuando}",
                "<strong>Modalidad:</strong> {modalidad}"
          ],
          "botonTexto": "Ver el caso"
    }),
  },
  {
    key: 'CORREO_REPORTE_RECIBIDO',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Reporte Post-Sesión a Coordinación',
    description: 'Aviso al equipo de coordinación cuando un profesional envía su reporte de cierre de sesión.',
    dataType: 'JSON',
    variables: ['resultado', 'profesional', 'queSigue', 'dificultades', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Respuesta sobre un caso: {resultado}",
          "titulo": "El profesional respondió",
          "parrafos": [
                "<strong>{profesional}</strong> nos contó qué pasó con un caso que tú asignaste."
          ],
          "datos": [
                "<strong>Respondió:</strong> {resultado}",
                "<strong>Qué sigue:</strong> {queSigue}",
                "<strong>Dificultades:</strong> {dificultades}"
          ],
          "botonTexto": "Ver el caso en el portal"
    }),
  },
  {
    key: 'CORREO_TAREA_INVITACION',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Invitación a Tarea de Apoyo a Voluntario',
    description: 'Invitación a un voluntario de apoyo para que confirme o decline una tarea interna.',
    dataType: 'JSON',
    variables: ['titulo', 'nombre', 'descripcion', 'nota', 'fechaLimite', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "[Aquí Estamos] Te necesitamos para una tarea: {titulo}",
          "titulo": "Hola {nombre}, ¿puedes apoyarnos?",
          "parrafos": [
                "El equipo de coordinación de la Red Aquí Estamos te está invitando a apoyar con la siguiente tarea:",
                "<strong>{titulo}</strong>",
                "{descripcion}",
                "<em>Nota del coordinador:</em> {nota}",
                "<strong>Fecha límite:</strong> {fechaLimite}",
                "Haz clic abajo para ver los detalles y confirmar si puedes apoyarnos. Si no puedes en este momento, también puedes declinarlo desde el mismo enlace."
          ],
          "datos": [],
          "botonTexto": "Ver tarea y confirmar"
    }),
  },
  {
    key: 'CORREO_TAREA_RESPUESTA',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Respuesta de Voluntario a Tarea',
    description: 'Aviso a coordinación cuando un voluntario acepta o rechaza una tarea asignada.',
    dataType: 'JSON',
    variables: ['accion', 'titulo', 'nombreVoluntario', 'motivoRechazo', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Respuesta de voluntario: {accion} — {titulo}",
          "titulo": "Un voluntario respondió a una tarea asignada",
          "parrafos": [
                "<strong>{nombreVoluntario}</strong> respondió a la tarea <strong>{titulo}</strong>."
          ],
          "datos": [
                "<strong>Respuesta:</strong> ❌ No puede en este momento",
                "<strong>Motivo:</strong> {motivoRechazo}"
          ],
          "botonTexto": "Ver la tarea en el portal"
    }),
  },
  {
    key: 'CORREO_VOLUNTARIO_APOYO_RECIBIDO',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Acuse de Registro de Voluntariado de Apoyo',
    description: 'Acuse de recibo para voluntarios de otras áreas (diseño, sistemas, legal, logística).',
    dataType: 'JSON',
    variables: ['nombre', 'disciplina'],
    defaultValue: JSON.stringify({
          "asunto": "Quedaste en el directorio de la red",
          "titulo": "Gracias por sumarte, {nombre}",
          "parrafos": [
                "Quedaste registrado en el voluntariado de apoyo como <strong>{disciplina}</strong>.",
                "Esto no te compromete a nada. Cuando aparezca una necesidad que encaje con lo que sabes hacer, te buscamos y te escribimos."
          ],
          "datos": [],
          "botonTexto": null
    }),
  },

  // =========================================================================
  // CATEGORÍA 3: PARÁMETROS GENERALES DEL SISTEMA (8 parámetros)
  // =========================================================================
  {
    key: 'DURACION_CITA_MINUTOS',
    category: 'PARAMETRO_GENERAL',
    name: 'Duración Estándar de la Sesión (Minutos)',
    description: 'Tiempo estándar programado para cada cita de atención psicológica.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '45',
  },
  {
    key: 'DESCANSO_CITA_MINUTOS',
    category: 'PARAMETRO_GENERAL',
    name: 'Tiempo de Descanso Obligatorio (Minutos)',
    description: 'Espacio de respiro obligatorio entre citas consecutivas de un mismo profesional.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '30',
  },
  {
    key: 'DIAS_VENCIMIENTO_PROPUESTA',
    category: 'PARAMETRO_GENERAL',
    name: 'Días de Vencimiento de Propuesta a Profesional',
    description: 'Días hábiles antes de que una propuesta de caso expire y vuelva a quedar disponible.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '2',
  },
  {
    key: 'SLA_MAXIMO_ALTA_DIAS',
    category: 'PARAMETRO_GENERAL',
    name: 'SLA Máximo para Casos de Prioridad ALTA (Días)',
    description: 'Plazo máximo objetivo para asignar y contactar a personas en prioridad ALTA.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '1',
  },
  {
    key: 'DOMINIO_JITSI',
    category: 'PARAMETRO_GENERAL',
    name: 'Servidor de Videollamadas WebRTC (Jitsi)',
    description: 'Dominio del servidor seguro para salas de videollamada sin bloqueo de moderador.',
    dataType: 'TEXTO',
    variables: [],
    defaultValue: 'meet.jit.si',
  },
  {
    key: 'TELEFONO_SOPORTE_OFICIAL',
    category: 'PARAMETRO_GENERAL',
    name: 'WhatsApp Oficial de Coordinación',
    description: 'Número de contacto institucional para resolver dudas y emergencias de agendamiento.',
    dataType: 'TEXTO',
    variables: [],
    defaultValue: '+573152213872',
  },
  {
    key: 'NOMBRE_RED',
    category: 'PARAMETRO_GENERAL',
    name: 'Nombre Oficial de la Organización',
    description: 'Nombre institucional que aparece en encabezados, firmas y mensajes.',
    dataType: 'TEXTO',
    variables: [],
    defaultValue: 'Red Aquí Estamos',
  },
  {
    key: 'SITIO_WEB_URL',
    category: 'PARAMETRO_GENERAL',
    name: 'URL Oficial del Sitio Web',
    description: 'Dominio web público de la plataforma (usado para links de WhatsApp y correos).',
    dataType: 'TEXTO',
    variables: [],
    defaultValue: 'https://www.redaquiestamos.org',
  },
]

// Cache en memoria para respuestas ultra-rápidas
let settingsCache = new Map()
let lastCacheSync = 0
const CACHE_TTL_MS = 60 * 1000 // 1 minuto

export const SettingsService = {
  /**
   * Asegura que todas las configuraciones por defecto existan en la BD y sincroniza valores de fábrica.
   */
  async ensureDefaults() {
    try {
      for (const def of DEFAULT_SETTINGS) {
        const actual = await prisma.systemSetting.findUnique({ where: { key: def.key } })

        /**
         * Si nadie lo tocó, el texto nuevo también entra.
         *
         * Antes esto sincronizaba el nombre, la descripción, las variables y el
         * valor de fábrica —todo menos `value`, que es lo único que se envía—.
         * Así que corregir una plantilla en el código no cambiaba ni un mensaje:
         * el texto viejo se quedaba en la base para siempre, y solo salía si a
         * alguien se le ocurría entrar a Parametrización y pulsar «restablecer».
         *
         * Se vio con el mensaje del enlace de agenda. El código decía una cosa,
         * la persona recibía otra: «Estos son los horarios en los que puede
         * atenderte:» seguido de nada, porque la variable que llenaba esa lista
         * ya no existía. La plantilla estaba bien conectada; lo que estaba viejo
         * era el texto guardado.
         *
         * Solo se pisa si `value` sigue siendo idéntico al valor de fábrica, que
         * es la marca de que nadie lo editó. Lo que la coordinación escribió con
         * sus palabras no se toca nunca: es suyo, y que un despliegue se lo
         * borre sería peor que el problema que esto arregla.
         */
        /**
         * «Nadie lo tocó» son dos cosas, y hacían falta las dos.
         *
         * La primera es que el texto siga siendo idéntico al de fábrica. La
         * segunda, que nadie lo haya guardado nunca desde el portal —lo dice
         * `updatedByEmail`, que solo se rellena cuando alguien pulsa guardar—.
         *
         * Con solo la primera, un valor de fábrica ANTIGUO se comportaba como
         * si fuera una edición: al cambiar el texto en el código dejaba de
         * coincidir, y la base se quedaba sirviendo para siempre una versión
         * que nadie escribió a mano. Se vio al conectar los correos: el asunto
         * seguía saliendo con el sufijo viejo aunque el código ya decía otra
         * cosa.
         *
         * Lo que una persona escribió con sus palabras sigue intocable: en
         * cuanto guarda una vez, `updatedByEmail` queda puesto y ningún
         * despliegue se lo pisa.
         */
        const nadieLoGuardo = actual != null && actual.updatedByEmail == null
        const sinTocar = actual != null && (actual.value === actual.defaultValue || nadieLoGuardo)

        await prisma.systemSetting.upsert({
          where: { key: def.key },
          update: {
            name: def.name,
            description: def.description,
            variables: def.variables,
            defaultValue: def.defaultValue,
            dataType: def.dataType,
            ...(sinTocar ? { value: def.defaultValue } : {}),
          },
          create: {
            key: def.key,
            category: def.category,
            name: def.name,
            description: def.description,
            value: def.defaultValue,
            defaultValue: def.defaultValue,
            variables: def.variables,
            dataType: def.dataType,
          },
        })
      }
      /**
       * Y el caché queda caliente al arrancar.
       *
       * Los correos consultan su plantilla justo antes de salir. Con el caché
       * frío, la primera consulta cuesta unos dos segundos —la conexión de
       * Prisma se abre ahí— y ese retraso se lo come el primer correo que sale
       * tras cada despliegue, que suele ser el que le dice a alguien que ya
       * tiene profesional.
       *
       * Aquí ya se ha recorrido cada ajuste, así que llenar el mapa no cuesta
       * ni una consulta más.
       */
      const todos = await prisma.systemSetting.findMany({ select: { key: true, value: true } })
      for (const s of todos) settingsCache.set(s.key, s.value)
      lastCacheSync = Date.now()
    } catch (err) {
      console.warn('[SettingsService] No se pudieron sincronizar defaults con BD:', err.message)
    }
  },

  /**
   * Obtiene todas las configuraciones organizadas.
   */
  async getAll({ category } = {}) {
    await this.ensureDefaults()

    const where = category ? { category } : {}
    const items = await prisma.systemSetting.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    return items
  },

  /**
   * Obtiene una configuración por su clave.
   */
  async getByKey(key) {
    const item = await prisma.systemSetting.findUnique({ where: { key } })
    if (item) return item

    const fallback = DEFAULT_SETTINGS.find((s) => s.key === key)
    return fallback
      ? {
          ...fallback,
          id: 'default',
          value: fallback.defaultValue,
        }
      : null
  },

  /**
   * Trae todos los ajustes de una vez y deja el caché listo.
   *
   * `ensureDefaults` ya lo hace al arrancar el servidor, pero hay dos caminos
   * que no pasan por ahí: las pruebas, que montan la app sin arrancarlo, y una
   * tanda de correos que llegue con el caché ya caducado.
   *
   * Sin esto, cada correo consulta su plantilla por separado y la PRIMERA
   * consulta contra una conexión fría cuesta unos dos segundos. Con veinte
   * avisos en la bandeja eso es una tanda que se arrastra, y lo notaba quien
   * espera el correo que le dice que ya tiene profesional.
   *
   * Es idempotente y barata: si el caché está fresco, no consulta nada.
   */
  async precargar() {
    if (Date.now() - lastCacheSync < CACHE_TTL_MS && settingsCache.size > 0) return

    try {
      const todos = await prisma.systemSetting.findMany({ select: { key: true, value: true } })
      for (const s of todos) settingsCache.set(s.key, s.value)
      lastCacheSync = Date.now()
    } catch (error) {
      // Sin caché se sigue funcionando: cada lectura irá a la base, más lento
      // pero correcto. Quedarse sin correos por esto sería mucho peor.
      console.warn('[SettingsService] no pude precargar el caché:', error.message)
    }
  },

  /**
   * Obtiene el valor directo de una configuración (con caché en memoria).
   */
  async getValue(key, fallbackValue = '') {
    const now = Date.now()
    if (now - lastCacheSync < CACHE_TTL_MS && settingsCache.has(key)) {
      return settingsCache.get(key)
    }

    /**
     * El caché estaba muerto: `lastCacheSync` solo se marcaba al GUARDAR, así
     * que la comprobación de arriba nunca daba cierta y cada lectura iba a la
     * base. Con una sola pantalla daba igual; desde que los correos consultan
     * su plantilla antes de salir, eso es una consulta por correo enviado.
     *
     * Marcarlo aquí no hace que un valor sin cachear se dé por bueno: la
     * condición exige ADEMÁS que la clave esté en el mapa. Lo que cambia es que
     * la ventana de un minuto por fin empieza a contar.
     */
    try {
      const item = await prisma.systemSetting.findUnique({ where: { key } })
      if (item) {
        settingsCache.set(key, item.value)
        lastCacheSync = Date.now()
        return item.value
      }
    } catch {}

    const def = DEFAULT_SETTINGS.find((s) => s.key === key)
    const val = def ? def.defaultValue : fallbackValue
    settingsCache.set(key, val)
    return val
  },

  /**
   * Actualiza el valor de una configuración.
   */
  async update(key, value, updatedByEmail = null) {
    const updated = await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value,
        updatedByEmail,
      },
      create: {
        key,
        category: DEFAULT_SETTINGS.find((s) => s.key === key)?.category ?? 'PARAMETRO_GENERAL',
        name: DEFAULT_SETTINGS.find((s) => s.key === key)?.name ?? key,
        value,
        defaultValue: DEFAULT_SETTINGS.find((s) => s.key === key)?.defaultValue ?? value,
        variables: DEFAULT_SETTINGS.find((s) => s.key === key)?.variables ?? [],
        updatedByEmail,
      },
    })

    settingsCache.set(key, value)
    lastCacheSync = Date.now()
    return updated
  },

  /**
   * Restablece una configuración a su valor de fábrica predeterminado.
   */
  async reset(key, updatedByEmail = null) {
    const def = DEFAULT_SETTINGS.find((s) => s.key === key)
    if (!def) throw new Error(`Configuración con clave "${key}" no encontrada.`)

    return this.update(key, def.defaultValue, updatedByEmail)
  },

  /**
   * Interpola variables `{variable}` en un texto o plantilla.
   */
  interpolate(template, data = {}) {
    if (typeof template !== 'string') return ''
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
      return data[key] !== undefined && data[key] !== null ? String(data[key]) : match
    })
  },
}
