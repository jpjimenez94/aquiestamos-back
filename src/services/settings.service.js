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
    variables: ['profesional', 'ciudad', 'modalidad', 'faltan', 'urgencia', 'agenda', 'enlace'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Te asignamos un acompañamiento:

· La persona está en {ciudad}.
· Prefiere que sea {modalidad}.
· {faltan}

{urgencia}

Ella va a elegir la hora directamente de tu agenda, entre los espacios que ya tienes marcados como libres.
· {agenda}

*Confírmanos que esos espacios siguen vigentes.* Si cambiaron, dínoslo y los ajustamos antes de pasárselos.

Cuando ella elija te llega la confirmación con el día, la hora y el enlace de la videollamada.

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
    variables: ['nombre', 'profesional', 'saludo', 'enlaceAgenda', 'nota'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

{saludo} Solo falta que elijas a qué hora.

*Entra aquí y escoge la que mejor te sirva*, entre las que {profesional} tiene libres:
{enlaceAgenda}

La sesión dura 45 minutos. En cuanto elijas, te confirmamos por aquí con todos los datos.

{nota}

Si prefieres, dinos por aquí qué días y horas puedes y lo cuadramos nosotros. Como te quede más cómodo.`,
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

Si te surge algo y no puedes, escríbenos por aquí con tiempo y lo movemos. No pasa nada.

Y guarda el enlace donde elegiste la hora: desde ahí puedes agendar tus próximas sesiones cuando las necesites.`,
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
    variables: ['profesional', 'persona', 'cuando', 'modalidad', 'enlaceReunion', 'canalContacto', 'enlaceCaso', 'consentimiento'],
    defaultValue: `Hola {profesional}, {persona} ya eligió su hora.

De acuerdo con la disponibilidad que tienes cargada en tu perfil, quedó agendado el acompañamiento:

· *Persona acompañada:* {persona}
· *Cuándo:* {cuando}
· *Modalidad:* {modalidad}
· *Enlace de videollamada:* {enlaceReunion}
· *Canal preferido de la persona:* {canalContacto}
· *Consentimiento informado:* {consentimiento}

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
    variables: ['nombre', 'profesional', 'profesionalNombre', 'cuando', 'modalidad', 'enlaceReunion'],
    defaultValue: `¡Hola {nombre}! Te escribimos de la Red Aquí Estamos.

Te recordamos tu sesión de acompañamiento con *{profesional}*, {cuando}, en modalidad *{modalidad}*.

· *Enlace de videollamada:* {enlaceReunion}

A la hora acordada solo tienes que abrir ese enlace desde tu celular o computador. No hay que descargar ni registrar nada.

Unos *15 minutos antes*, {profesionalNombre} te escribe por WhatsApp para coordinar el inicio.

Si te surge un imprevisto y no puedes, avísanos por aquí con tiempo y reprogramamos tu espacio: no pasa nada.

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
    key: 'WHATSAPP_CAMBIO_DE_PROFESIONAL',
    category: 'MENSAJE_WHATSAPP',
    name: 'Cambio de profesional · Avisarle a la persona',
    description:
      'Enviado a la persona acompañada cuando su caso se reasigna. Era el único cambio del que nadie le avisaba: su cita se cancelaba y lo siguiente que veía era su enlace de agenda diciendo «todavía estamos buscando».',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'citaCancelada'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

Tenemos que contarte un cambio: {profesional} no va a poder seguir con tu acompañamiento.

{citaCancelada}

No es por nada que hayas hecho, y tu proceso sigue en pie. Ya estamos buscando a otra persona de la red para ti; te escribimos por aquí en cuanto la tengamos, con su nombre y con tu enlace para elegir hora.

Sentimos el cambio y la espera. Si necesitas algo mientras tanto, escríbenos por aquí.

Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes nuestra respuesta: llama al *106* (línea 106) o al *192* (línea 192). Son gratuitas y atienden a toda hora.`,
  },
  {
    key: 'WHATSAPP_CITA_CANCELADA_PERSONA',
    category: 'MENSAJE_WHATSAPP',
    name: 'Cancelar la sesión · Avisarle a la persona',
    description:
      'Enviado a la persona acompañada cuando se cancela una sesión suya sin reprogramarla en el momento. Cancelar no avisaba a nadie: ella podía presentarse a una sesión que ya no existía.',
    dataType: 'TEXTO',
    variables: ['nombre', 'profesional', 'cuando'],
    defaultValue: `Hola {nombre}, te escribimos de la Red Aquí Estamos.

Tenemos que cancelar la sesión que tenías el {cuando} con {profesional}. Sentimos el cambio.

Tu acompañamiento sigue en pie. Con el mismo enlace donde elegiste la hora puedes escoger otra, entre las que {profesional} tiene libres.

Si prefieres que la cuadremos nosotros, dinos por aquí qué días y horas te sirven y lo hacemos.`,
  },
  {
    key: 'WHATSAPP_CITA_CANCELADA_PROFESIONAL',
    category: 'MENSAJE_WHATSAPP',
    name: 'Cancelar la sesión · Avisarle al profesional',
    description:
      'Enviado al psicólogo cuando se cancela una sesión suya. Sin este aviso podía presentarse a una cita que ya no existía: no tiene cuenta en el portal para verlo por su cuenta.',
    dataType: 'TEXTO',
    variables: ['profesional', 'persona', 'cuando'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Cancelamos la sesión que tenías el {cuando} con {persona}. Ese espacio te queda libre.

El caso sigue contigo: ella puede elegir otra hora de tu agenda, y cuando lo haga te llega la confirmación con el día, la hora y el enlace de la videollamada.

Gracias por tu tiempo.`,
  },
  {
    key: 'WHATSAPP_PEDIR_DOCUMENTOS',
    category: 'MENSAJE_WHATSAPP',
    name: 'Documentación · Pedir Tarjeta Profesional / Cédula',
    description: 'Solicitud al psicólogo para cargar su tarjeta profesional y cédula de ciudadanía por enlace seguro.',
    dataType: 'TEXTO',
    variables: ['profesional', 'documentos', 'enlace'],
    defaultValue: `Hola {profesional}, te escribimos de Red Aquí Estamos.

Recibimos tu postulación para acompañar en la red. Gracias por dar este paso: nos alegra contar contigo.

Para dejar tu perfil listo y poder asignarte acompañamientos, nos faltan dos documentos. Es por la seguridad de todos — de quienes acompañan y de quienes son acompañados:
{documentos}
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
    variables: ['nombre', 'cuando', 'modalidad', 'sala', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Te agendamos una cita",
          "titulo": "Tienes una cita agendada",
          "parrafos": [
                "Hola {nombre}, te agendamos un acompañamiento.",
                "Los datos de contacto de la persona están en el enlace de abajo. Entras con este mismo correo."
          ],
          "datos": [
                "<strong>Cuándo:</strong> {cuando}",
                "<strong>Modalidad:</strong> {modalidad}",
                "<strong>Sala virtual:</strong> <a href=\"{sala}\">{sala}</a>"
          ],
          "botonTexto": "Ver el caso"
    }),
  },
  {
    key: 'CORREO_CITA_AGENDADA_PERSONA',
    category: 'PLANTILLA_CORREO',
    name: 'Correo · Confirmación de sesión a la persona',
    description:
      'A la persona en cuanto queda agendada su sesión, con la hora y su enlace de entrada. Antes no recibía nada hasta el recordatorio del día.',
    dataType: 'JSON',
    variables: ['nombre', 'profesional', 'cuandoLargo', 'modalidadLegible', 'sala'],
    defaultValue: JSON.stringify({
          "asunto": "Tu sesión quedó agendada: {cuandoLargo}",
          "titulo": "Listo, {nombre}: tu sesión quedó agendada",
          "parrafos": [
                "Te acompaña <strong>{profesional}</strong>. Guarda este correo: aquí tienes todo lo que necesitas.",
                "Si te surge algo y no puedes, respóndenos por WhatsApp con tiempo y lo movemos. No pasa nada.",
                "Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes: llama al 123 (emergencias) o al 106 (salud mental). Son gratuitas y atienden a toda hora."
          ],
          "datos": [
                "<strong>Cuándo:</strong> {cuandoLargo}",
                "<strong>Modalidad:</strong> {modalidadLegible}",
                "<strong>Tu enlace para entrar:</strong> <a href=\"{sala}\">{sala}</a>"
          ]
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
    variables: ['accionLegible', 'respuesta', 'titulo', 'nombreVoluntario', 'motivoRechazo', 'ruta'],
    defaultValue: JSON.stringify({
          "asunto": "Respuesta de voluntario: {accionLegible} — {titulo}",
          "titulo": "Un voluntario respondió a una tarea asignada",
          "parrafos": [
                "<strong>{nombreVoluntario}</strong> respondió a la tarea <strong>{titulo}</strong>."
          ],
          "datos": [
                "<strong>Respuesta:</strong> {respuesta}",
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
    name: 'Días para que el profesional responda antes de liberar (días)',
    description:
      'Solo aplica a las propuestas antiguas, de cuando asignar significaba pedir permiso y esperar. Hoy se asigna y se avisa, así que no se crean nuevas.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '2',
  },
  {
    key: 'SLA_MAXIMO_ALTA_DIAS',
    category: 'PARAMETRO_GENERAL',
    name: 'Plazo máximo para casos de prioridad ALTA (días)',
    description:
      'A partir de cuántos días sin sesión un caso de prioridad ALTA se marca como atrasado en el tablero.',
    dataType: 'NUMERO',
    variables: [],
    // Decía 1 mientras el código usaba 3. Nadie leía este número, así que la
    // contradicción no se notaba: manda lo que de verdad estaba pasando.
    defaultValue: '3',
  },
  {
    key: 'DIAS_VENCIMIENTO_ACEPTADA',
    category: 'PARAMETRO_GENERAL',
    name: 'Días para cuadrar el horario antes de liberar el caso (días)',
    description:
      'Es el «se libera en N días si no hay respuesta» del tablero. Cuenta desde que el profesional acepta; si al cabo de ese plazo no se ha cuadrado la hora, el caso vuelve a la cola para que no se quede quieto.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '3',
  },
  {
    key: 'ANTELACION_MINIMA_HORAS',
    category: 'PARAMETRO_GENERAL',
    name: 'Antelación mínima para agendar (horas)',
    description:
      'Las horas dentro de este margen no se le ofrecen a la persona cuando elige. Es el tiempo que necesita coordinación para avisar al profesional y dejar todo listo.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '3',
  },
  {
    key: 'CONFIRMAR_DISPONIBILIDAD_DIAS',
    category: 'PARAMETRO_GENERAL',
    name: 'Cada cuánto preguntar al profesional si sigue disponible (días)',
    description:
      'Cada cuántos días se le escribe a un profesional activo para confirmar que sigue pudiendo recibir casos.',
    dataType: 'NUMERO',
    variables: [],
    defaultValue: '30',
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
  {
    key: 'CORREO_COORD_POSTULACION',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Aviso a coordinación de postulación nueva",
    description: "Le llega a coordinación cuando alguien se postula como profesional.",
    dataType: 'JSON',
    variables: ["nombre","ciudad","profesion"],
    defaultValue: JSON.stringify({
          "asunto": "Nueva postulación de profesional",
          "titulo": "Llegó una postulación",
          "parrafos": [
                "Hay una postulación nueva esperando revisión."
          ],
          "datos": [
                "<strong>Quién:</strong> {nombre}",
                "<strong>Ciudad:</strong> {ciudad}",
                "<strong>Profesión:</strong> {profesion}"
          ],
          "botonTexto": "Ver las postulaciones"
    }),
  },
  {
    key: 'CORREO_COORD_APOYO',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Aviso a coordinación de voluntariado de apoyo",
    description: "Le llega a coordinación cuando alguien se registra desde otra disciplina.",
    dataType: 'JSON',
    variables: ["nombre","disciplina","ciudad"],
    defaultValue: JSON.stringify({
          "asunto": "Nuevo voluntariado de apoyo",
          "titulo": "Alguien se sumó desde otra disciplina",
          "parrafos": [
                "Hay un registro nuevo en el directorio de voluntariado de apoyo."
          ],
          "datos": [
                "<strong>Quién:</strong> {nombre}",
                "<strong>Disciplina:</strong> {disciplina}",
                "<strong>Ciudad:</strong> {ciudad}"
          ],
          "botonTexto": "Ver el directorio"
    }),
  },
  {
    key: 'CORREO_COORD_SOLICITUD',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Aviso a coordinación de solicitud nueva",
    description: "Entró una solicitud por el formulario público. No lleva datos de la persona a propósito.",
    dataType: 'JSON',
    variables: ["ciudad"],
    defaultValue: JSON.stringify({
          "asunto": "Nueva solicitud de acompañamiento",
          "titulo": "Llegó una solicitud",
          "parrafos": [
                "Entró una solicitud de acompañamiento por el formulario público.",
                "Los datos de la persona están en el portal. Este correo no los incluye a propósito."
          ],
          "datos": [
                "<strong>Desde:</strong> {ciudad}"
          ],
          "botonTexto": "Ver las solicitudes"
    }),
  },
  {
    key: 'CORREO_COORD_TAMIZAJE_ALTA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Aviso urgente de prioridad alta",
    description: "El aviso más urgente que manda el sistema: alguien respondió el tamizaje y salió prioridad alta.",
    dataType: 'JSON',
    variables: ["ciudad","avisoMenor"],
    defaultValue: JSON.stringify({
          "asunto": "URGENTE · alguien necesita acompañamiento hoy",
          "titulo": "Hay una solicitud de prioridad alta",
          "parrafos": [
                "Una persona respondió las preguntas previas y sus respuestas la ponen en prioridad alta.",
                "Los datos y el motivo están en el portal. Este correo no los incluye a propósito."
          ],
          "datos": [
                "<strong>Desde:</strong> {ciudad}",
                "{avisoMenor}"
          ],
          "botonTexto": "Ver la solicitud"
    }),
  },
  {
    key: 'CORREO_COORD_PROPUESTA_ACEPTADA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · El profesional confirmó el caso",
    description: "Le llega a coordinación cuando el profesional confirma desde su enlace.",
    dataType: 'JSON',
    variables: ["profesional","nota"],
    defaultValue: JSON.stringify({
          "asunto": "Un profesional confirmó un caso",
          "titulo": "Confirmó que puede tomarlo",
          "parrafos": [
                "<strong>{profesional}</strong> confirmó que puede acompañar un caso que le asignaste.",
                "La persona elige la hora de su agenda. Si todavía no le has mandado su enlace, es el momento."
          ],
          "datos": [
                "<strong>Además dijo:</strong> {nota}"
          ],
          "botonTexto": "Ver el caso"
    }),
  },
  {
    key: 'CORREO_COORD_PROPUESTA_RECHAZADA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · El profesional no pudo tomar el caso",
    description: "Le llega a coordinación cuando el profesional declina. Hay que buscarle otro.",
    dataType: 'JSON',
    variables: ["profesional","motivo"],
    defaultValue: JSON.stringify({
          "asunto": "Un profesional no pudo tomar un caso",
          "titulo": "Hay que proponérselo a otro",
          "parrafos": [
                "<strong>{profesional}</strong> no puede tomar un caso que le propusiste.",
                "La persona vuelve a la cola de pendientes por asignar. Cuanto antes se le proponga a alguien más, menos espera."
          ],
          "datos": [
                "<strong>Dijo:</strong> {motivo}"
          ],
          "botonTexto": "Buscarle otro profesional"
    }),
  },
  {
    key: 'CORREO_COORD_ASIGNACION_VENCIDA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · El barrido liberó una asignación",
    description: "El caso volvió a la cola por falta de respuesta. No reparte culpas: el sistema no sabe de quién fue el silencio.",
    dataType: 'JSON',
    variables: ["explicacion"],
    defaultValue: JSON.stringify({
          "asunto": "Un caso volvió a la cola por falta de respuesta",
          "titulo": "Hay que proponérselo a otro profesional",
          "parrafos": [
                "{explicacion}",
                "El cupo del profesional quedó libre y la persona volvió a la cola de pendientes por asignar."
          ],
          "botonTexto": "Buscarle otro profesional"
    }),
  },
  {
    key: 'CORREO_RECORDATORIO_CITA_PROFESIONAL',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Recordatorio de sesión al profesional",
    description: "Sale solo, unas horas antes de la sesión.",
    dataType: 'JSON',
    variables: ["cuandoLargo","nombre","modalidadLegible"],
    defaultValue: JSON.stringify({
          "asunto": "Recordatorio: tienes sesión {cuandoLargo}",
          "titulo": "Hola {nombre}, tu sesión se acerca",
          "parrafos": [
                "Te recordamos que tienes una sesión de acompañamiento <strong>{cuandoLargo}</strong> ({modalidadLegible}).",
                "Los datos de contacto de la persona están en tu enlace del caso, como siempre."
          ],
          "botonTexto": "Abrir mi caso"
    }),
  },
  {
    key: 'CORREO_RECORDATORIO_CITA_PERSONA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Recordatorio de sesión a la persona",
    description: "Uno de los dos únicos correos que recibe la persona acompañada. Lleva las líneas de crisis.",
    dataType: 'JSON',
    variables: ["cuandoLargo","nombre","profesional","modalidadLegible"],
    defaultValue: JSON.stringify({
          "asunto": "Recordatorio: tu acompañamiento es {cuandoLargo}",
          "titulo": "Hola {nombre}, tu espacio se acerca",
          "parrafos": [
                "Te recordamos tu sesión de acompañamiento con <strong>{profesional}</strong>: <strong>{cuandoLargo}</strong> ({modalidadLegible}).",
                "{profesional} se pondrá en contacto contigo para ese momento. No tienes que hacer nada más.",
                "Si te surge algo y no puedes, respóndenos por WhatsApp con tiempo y lo movemos. No pasa nada.",
                "Si en este momento estás en peligro o sientes que puedes hacerte daño, no esperes: llama al 123 (emergencias) o al 106 (salud mental). Son gratuitas y atienden a toda hora."
          ]
    }),
  },
  {
    key: 'CORREO_FALTA_CONSENTIMIENTO',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Falta la firma del consentimiento",
    description: "A la persona, un par de horas después de agendar, si no firmó. El otro correo que ella recibe.",
    dataType: 'JSON',
    variables: ["nombre","profesional","cuandoLargo"],
    defaultValue: JSON.stringify({
          "asunto": "Te falta un paso para tu sesión",
          "titulo": "Hola {nombre}, quedó pendiente tu consentimiento",
          "parrafos": [
                "Tu sesión con <strong>{profesional}</strong> quedó agendada para <strong>{cuandoLargo}</strong>.",
                "Antes de la sesión necesitamos que leas y aceptes el consentimiento. Es corto y se hace desde el celular, en un minuto.",
                "Si cambiaste de opinión o ya no puedes, escríbenos por WhatsApp: movemos la hora o la soltamos, sin problema."
          ],
          "botonTexto": "Leer y firmar"
    }),
  },
  {
    key: 'CORREO_PIDE_REPORTE',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Pedirle el reporte al profesional",
    description: "Al profesional, unas horas después de la sesión, para que cuente qué pasó.",
    dataType: 'JSON',
    variables: ["nombre","cuandoLargo"],
    defaultValue: JSON.stringify({
          "asunto": "¿Cómo te fue? Cuéntanos desde tu enlace",
          "titulo": "Hola {nombre}, pasó la hora de tu sesión",
          "parrafos": [
                "Tu sesión estaba agendada para {cuandoLargo}. Entra a tu enlace del caso y cuéntanos tres cosas: si se pudo hacer, cómo te fue, y si crees que la persona necesita más sesiones o con esta fue suficiente.",
                "Con eso cerramos esta cita y cuadramos la siguiente si hace falta, sin tener que escribirte a preguntar."
          ],
          "botonTexto": "Contar cómo me fue"
    }),
  },
  {
    key: 'CORREO_COORD_DOCUMENTOS_RECIBIDOS',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Documentos recibidos, falta verificar",
    description: "Un profesional subió su tarjeta y su identidad por su enlace.",
    dataType: 'JSON',
    variables: ["profesional"],
    defaultValue: JSON.stringify({
          "asunto": "Documentos recibidos: hay una verificación pendiente",
          "titulo": "Un profesional subió sus documentos",
          "parrafos": [
                "<strong>{profesional}</strong> subió su tarjeta (o certificado) y su documento de identidad por su enlace.",
                "Están en la pantalla de verificaciones, con el documento a la vista y los datos del perfil al lado, para aprobar en un clic."
          ],
          "botonTexto": "Revisar y aprobar"
    }),
  },
  {
    key: 'CORREO_COORD_POSIBLE_DUPLICADO',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Posible ficha duplicada",
    description: "El teléfono de una admisión ya aparece en otra ficha activa.",
    dataType: 'JSON',
    variables: ["ciudad","enlaceNueva","enlaceExistente"],
    defaultValue: JSON.stringify({
          "asunto": "Posible ficha duplicada",
          "titulo": "El mismo teléfono está en dos fichas",
          "parrafos": [
                "Se admitió a una persona en {ciudad} cuyo teléfono ya aparece en otra ficha activa. Puede ser la misma persona pidiendo ayuda dos veces.",
                "Revisa las dos y, si son la misma, cierra una con motivo: dos fichas de la misma persona son dos profesionales llamando al mismo teléfono."
          ],
          "datos": [
                "<strong>Ficha nueva:</strong> {enlaceNueva}",
                "<strong>Ficha existente:</strong> {enlaceExistente}"
          ]
    }),
  },
  {
    key: 'CORREO_COORD_SLA_ALTA',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Prioridad alta sin asignar",
    description: "Una persona de prioridad alta lleva demasiados días en la cola.",
    dataType: 'JSON',
    variables: ["dias","ciudad"],
    defaultValue: JSON.stringify({
          "asunto": "Prioridad ALTA sin asignar hace {dias} días",
          "titulo": "Un caso urgente se está quedando en la cola",
          "parrafos": [
                "Una persona admitida con <strong>prioridad alta</strong> en {ciudad} lleva <strong>{dias} días</strong> sin profesional asignado.",
                "Cuanto antes se le proponga a alguien, menos espera quien peor está."
          ],
          "botonTexto": "Buscarle profesional"
    }),
  },
  {
    key: 'CORREO_TAREA_AGRADECIMIENTO',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Agradecimiento al voluntario",
    description: "Al voluntario que completó una labor.",
    dataType: 'JSON',
    variables: ["titulo","nombre"],
    defaultValue: JSON.stringify({
          "asunto": "[Aquí Estamos] ¡Muchas gracias por tu apoyo con \"{titulo}\"!",
          "titulo": "¡Muchas gracias, {nombre}!",
          "parrafos": [
                "Queremos agradecerte de corazón por tu valiosa colaboración en la labor <strong>{titulo}</strong>.",
                "Gracias a tu tiempo y disciplina, el equipo de la Red Aquí Estamos puede seguir brindando acompañamiento oportuno y de calidad a quienes más lo necesitan.",
                "Pronto te contactaremos cuando tengamos nuevas iniciativas en las que puedas seguir aportando tu talento."
          ],
          "botonTexto": "Conoce más sobre la Red"
    }),
  },
  {
    key: 'CORREO_TAREA_ENTREGA_COORD',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Entrega de labor a coordinación",
    description: "Le llega a coordinación cuando un voluntario marca su labor como completada.",
    dataType: 'JSON',
    variables: ["nombreVoluntario","titulo","completionUrl","completionNote"],
    defaultValue: JSON.stringify({
          "asunto": "Entrega de labor completada: {nombreVoluntario} — {titulo}",
          "titulo": "Un voluntario completó su labor",
          "parrafos": [
                "<strong>{nombreVoluntario}</strong> marcó como completada la tarea <strong>{titulo}</strong>."
          ],
          "datos": [
                "<strong>Enlace de entrega:</strong> <a href=\"{completionUrl}\">{completionUrl}</a>",
                "<strong>Comentario del voluntario:</strong> {completionNote}"
          ],
          "botonTexto": "Ver la tarea en el portal"
    }),
  },
  {
    key: 'CORREO_COORD_PACIENTE_ADMITIDO',
    category: 'PLANTILLA_CORREO',
    name: "Correo · Persona admitida, falta asignarle",
    description: "Hay alguien esperando profesional. El texto cambia si nunca respondió el tamizaje.",
    dataType: 'JSON',
    variables: ["asuntoAdmitida","avisoSinRespuesta","prioridadLegible","ciudad"],
    defaultValue: JSON.stringify({
          "asunto": "{asuntoAdmitida}",
          "titulo": "Hay alguien esperando profesional",
          "parrafos": [
                "Se admitió una solicitud y está pendiente de que se le asigne profesional.",
                "{avisoSinRespuesta}"
          ],
          "datos": [
                "<strong>Prioridad:</strong> {prioridadLegible}",
                "<strong>Ciudad:</strong> {ciudad}"
          ],
          "botonTexto": "Buscarle profesional"
    }),
  },
  {
    key: 'CORREO_CONFIRMAR_DISPONIBILIDAD',
    category: 'PLANTILLA_CORREO',
    name: "Correo · ¿Tu disponibilidad sigue igual?",
    description: "Al profesional cada tantos meses. Es lo que hace justo asignar sin preguntar.",
    dataType: 'JSON',
    variables: ["nombre","agenda","desdeCuando"],
    defaultValue: JSON.stringify({
          "asunto": "¿Tu disponibilidad sigue igual?",
          "titulo": "Hola {nombre}, una pregunta rápida",
          "parrafos": [
                "Cuando te llega un acompañamiento, la persona elige su hora directamente de la agenda que tienes en tu perfil. Por eso te preguntamos de vez en cuando si sigue estando al día.",
                "Si nada cambió, no tienes que hacer nada: con eso nos vale. Si cambió —otro trabajo, otros horarios, o simplemente este no es buen momento— entra y ajústala, o dinos y te dejamos en pausa.",
                "Estar en pausa no es irse de la red. Es no recibir casos hasta que vuelvas a decirnos que sí."
          ],
          "datos": [
                "<strong>Tu agenda hoy:</strong> {agenda}",
                "<strong>La cargaste:</strong> {desdeCuando}"
          ],
          "botonTexto": "Revisar mi disponibilidad"
    }),
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
   * Lee un parámetro numérico de Parametrización.
   *
   * Existía `getValue`, que devuelve texto. Cada sitio que quisiera un número
   * tenía que acordarse de convertirlo y de qué hacer si alguien escribe
   * «tres» o deja el campo vacío — y basta con que uno se despiste para que un
   * NaN se cuele en una resta de fechas y el plazo se vuelva una fecha
   * inválida, sin ruido.
   *
   * Si lo guardado no es un número utilizable, manda el valor por defecto: un
   * parámetro mal escrito no puede apagar un barrido.
   */
  async getNumero(key, porDefecto) {
    const crudo = await this.getValue(key, String(porDefecto))

    /**
     * El campo en blanco no es un cero.
     *
     * `Number('')` da 0, y 0 es un número perfectamente válido: pasaba el
     * filtro y se convertía en el parámetro. Borrar el contenido del campo
     * —o guardarlo sin escribir nada— apagaba la regla en silencio. Con la
     * antelación mínima eso significa volver a ofrecer horas para dentro de
     * diez minutos, que es justo lo que ese margen existe para impedir, y sin
     * que nada avise.
     *
     * Un 0 escrito a propósito sí vale: quien coordina puede querer quitar el
     * margen. Lo que no puede pasar es que quitarlo sea un descuido.
     */
    if (typeof crudo !== 'string' || crudo.trim() === '') return porDefecto

    const n = Number(crudo)
    return Number.isFinite(n) && n >= 0 ? n : porDefecto
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
