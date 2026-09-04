import { primerNombre } from '../nombre.js'
import { leerEnlaceAgenda } from '../auth/enlaceAgenda.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { PatientModel } from '../models/patient.model.js'
import { AppointmentModel } from '../models/appointment.model.js'
import {
  huecosDisponibles,
  DURACION_MINIMA,
  DESCANSO,
  sinSolaparse,
  parametrosDeAgenda,
  modalidadDeAgenda,
  modalidadDeSesion,
} from '../services/scheduling.service.js'
import { crearCita, confirmarHorario } from '../services/appointment.service.js'
import { firmarConsentimientoSchema } from '../validators/consentimiento.schema.js'
import { prisma } from '../config/database.js'
import { enPalabras } from '../services/timezone.service.js'
import { citaAgendada } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'

/**
 * CONTROLADOR: la persona agenda su propia sesión.
 *
 * Hasta ahora cuadrar una hora costaba tres toques humanos y dos esperas:
 * coordinación le escribía a la persona con las opciones, la persona
 * respondía por WhatsApp, y coordinación agendaba. Entre medias podían pasar
 * días —de ahí sale buena parte de las asignaciones que se mueren esperando.
 *
 * Es una puerta pública y carga con lo mismo que las otras: token firmado con
 * vencimiento adentro, límite de peticiones, y una vista que enseña lo mínimo.
 *
 * La diferencia con las demás es de qué habla el token: de la PERSONA, no de
 * una pareja ni de una cita. Por eso aquí se busca en cada visita quién es su
 * profesional AHORA. Si en la tercera sesión cambió, el mismo enlace muestra
 * la agenda del nuevo sin que nadie tenga que mandar nada.
 */

/** Cuántos días hacia adelante se ofrecen. Más allá, la agenda es adivinanza. */
const DIAS_A_MOSTRAR = 21

/**
 * Quién acompaña a esta persona ahora mismo, o null.
 *
 * Devuelve la asignación viva —propuesta, aceptada o activa—, que es lo que
 * hace que el enlace siga sirviendo entre un profesional y el siguiente.
 */
async function acompanamientoDe(token) {
  const datos = leerEnlaceAgenda(token)
  if (!datos) return null

  const paciente = await PatientModel.findById(datos.paciente)
  if (!paciente || paciente.deletedAt) return null

  const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(paciente.id)
  return { paciente, asignacion }
}

/**
 * ¿Este rato choca con alguna cita que la persona ya tiene?
 *
 * Solo cuentan las citas vivas: una cancelada no ocupa nada.
 */
function seCruzaConAlgoSuyo(citas, inicio, fin) {
  const a = new Date(inicio).getTime()
  const b = new Date(fin).getTime()
  return citas
    .filter((c) => ['PROGRAMADA', 'CONFIRMADA'].includes(c.status))
    .some((c) => {
      const ci = new Date(c.startsAt).getTime()
      const cf = new Date(c.endsAt).getTime()
      return a < cf && b > ci
    })
}

/**
 * Si esta persona ya firmó el consentimiento en alguna sesión.
 *
 * Es la misma pregunta que se hace `crearCita` para heredar la firma, hecha
 * aquí ANTES de crear nada: de ella depende si hay que pedírsela o no, y
 * pedirla dos veces a quien ya firmó es tan malo como no pedirla nunca.
 */
async function yaFirmoAlgunaVez(patientId) {
  const previa = await prisma.appointment.findFirst({
    where: { patientId, consentSigned: true },
    select: { id: true },
  })
  return previa !== null
}

/** Respuesta idéntica para un token inventado y para una persona borrada. */
function noSirve(res) {
  return res
    .status(404)
    .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
}

export const AgendaPersonaController = {
  /**
   * GET /api/mi-agenda/:token
   *
   * Con quién es, cuándo es la próxima si ya hay, y qué horas quedan libres.
   */
  async mostrar(req, res, next) {
    try {
      const ctx = await acompanamientoDe(req.params.token)
      if (!ctx) return noSirve(res)

      const { paciente, asignacion } = ctx

      /**
       * Sin profesional no hay agenda. Pero hay dos motivos, y no dicen lo
       * mismo.
       *
       * Esto respondía siempre SIN_PROFESIONAL, y la pantalla lo traduce en
       * «Todavía estamos buscando quién te acompañe. En cuanto tengamos
       * profesional para ti, te avisamos por WhatsApp». Con el caso cerrado eso
       * es falso: nadie está buscando, y la persona se queda esperando un aviso
       * que no va a llegar. El enlace le sirve para todas sus sesiones, así que
       * es normal que vuelva a abrirlo meses después.
       */
      if (!asignacion?.professional) {
        const cerrado = paciente.status === 'CERRADO'
        return res.json(
          ok({
            persona: primerNombre(paciente.fullName),
            profesional: null,
            estado: cerrado ? 'ACOMPANAMIENTO_CERRADO' : 'SIN_PROFESIONAL',
            proxima: null,
            huecos: [],
          }),
        )
      }

      const proximas = await AppointmentModel.findDePaciente(paciente.id)
      const proxima = proximas
        .filter((c) => ['PROGRAMADA', 'CONFIRMADA'].includes(c.status))
        .filter((c) => new Date(c.startsAt) > new Date())
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0]

      const desde = new Date()
      const hasta = new Date(Date.now() + DIAS_A_MOSTRAR * 24 * 3600 * 1000)

      const huecos = await huecosDisponibles({
        professionalId: asignacion.professionalId,
        desde,
        hasta,
        duracionMinutos: DURACION_MINIMA,
        modalidad: modalidadDeAgenda(paciente.preferredModality),
        /**
         * Nada para dentro de un rato.
         *
         * Entre que ella elige y la hora llega hay que avisar al profesional
         * con el enlace de la videollamada, pedirle a ella el consentimiento y
         * que coordinación pueda mirar que todo esté en orden. Sin margen, se
         * podía reservar algo que empezaba en diez minutos: la cita quedaba
         * puesta, nadie llegaba a nada, y quien pidió ayuda se quedaba sola en
         * una sala.
         */
        antelacionHoras: (await parametrosDeAgenda()).antelacionHoras,
      })

      /**
       * Quitar las horas en las que la persona ya tiene algo.
       *
       * `huecosDisponibles` solo sabe de la agenda del PROFESIONAL: para él
       * esa hora está libre. Pero la persona puede tener otra sesión ahí
       * —pasa justo cuando cambia de profesional y arrastra una cita ya
       * agendada con el anterior—, y ofrecérsela sería invitarla a chocar
       * contra un error después de haber elegido.
       */
      const libresParaElla = huecos.filter(
        (h) => !seCruzaConAlgoSuyo(proximas, h.inicio, h.fin),
      )

      /**
       * Y solo los que son opciones DISTINTAS.
       *
       * Los inicios se generan cada 15 minutos, pero una sesión bloquea 75 con
       * su descanso: por cada hueco real se ofrecían cinco botones que se
       * excluyen entre sí. Una profesional con agenda amplia le pintaba a la
       * persona ochenta botones donde había doce decisiones.
       *
       * Se adelgaza DESPUÉS de quitar sus propios choques, no antes: si se
       * hiciera al revés, un hueco descartado por chocar con otra cita suya
       * habría tapado al vecino que sí servía, y esa hora se perdería sin que
       * nadie lo notara.
       *
       * La coordinación no pasa por aquí: cuando agenda a mano desde el portal
       * sigue viendo la granularidad fina, porque a veces hay que encajar algo
       * concreto y ahí el ruido es precisión.
       */
      const opciones = sinSolaparse(libresParaElla, DESCANSO)

      return res.json(
        ok({
          persona: primerNombre(paciente.fullName),
          // Del profesional sí va el nombre completo: la persona tiene derecho
          // a saber con quién se va a sentar, y es dato profesional, no íntimo.
          profesional: asignacion.professional.fullName,
          modalidad: paciente.preferredModality ?? null,
          estado: asignacion.status,
          /**
           * Si le va a tocar firmar al elegir su hora.
           *
           * La pantalla lo necesita ANTES de que elija, no después: el
           * consentimiento se le enseña junto a la hora, en la misma decisión.
           * Quien ya firmó en una sesión anterior no lo vuelve a ver.
           */
          consentimiento: { firmado: await yaFirmoAlgunaVez(paciente.id) },
          // Quien firma por un menor es su madre, su padre o su acudiente, y el
          // texto de la casilla tiene que decirlo antes de que la marque.
          esMenor: paciente.isMinor ?? false,
          proxima: proxima
            ? { inicio: proxima.startsAt, cuando: enPalabras(proxima.startsAt) }
            : null,
          // El tope se queda como red de seguridad, pero ya no recorta nada
          // en la práctica: eran 60 de ochenta y pico, ahora son doce.
          huecos: opciones.slice(0, 60).map((h) => ({
            inicio: h.inicio,
            fin: h.fin,
            cuando: enPalabras(h.inicio),
          })),
        }),
      )
    } catch (error) {
      return next(error)
    }
  },

  /**
   * POST /api/mi-agenda/:token
   *
   * La persona elige una hora Y acepta el consentimiento, en un solo acto.
   *
   * Eran dos: se creaba la cita APARTADA y la pantalla le pedía la firma
   * después. Quien cerraba ahí dejaba una hora ocupada que no servía para
   * nada —sin firma no se empieza la sesión—, y coordinación tenía que
   * perseguir una firma o soltar el espacio a mano. La hora bloqueada era
   * real; la sesión, no.
   *
   * Sin firma no se crea nada. La cita nace CONFIRMADA porque ya no le falta
   * nada: la persona eligió la hora y aceptó el consentimiento en el mismo
   * momento. Quien ya firmó en una sesión anterior no lo vuelve a ver.
   *
   * Dos caminos según dónde esté el acompañamiento: si el profesional aceptó
   * y falta cuadrar, esto ACTIVA la asignación; si ya está en curso, es
   * simplemente la sesión siguiente.
   */
  async agendar(req, res, next) {
    try {
      const ctx = await acompanamientoDe(req.params.token)
      if (!ctx) return noSirve(res)

      const { paciente, asignacion } = ctx
      if (!asignacion?.professional) {
        return res.status(409).json(failure('Todavía no tienes profesional asignado.'))
      }

      // Se lee una vez y se usa en los tres sitios de este handler: filtrar
      // los huecos, decidir si llegó tarde y decírselo. Leerlo tres veces
      // abriría la puerta a que alguien cambie el número entre lectura y
      // lectura y el mensaje contradiga a la comprobación.
      const { antelacionHoras } = await parametrosDeAgenda()

      const inicio = new Date(req.body?.inicio)
      if (Number.isNaN(inicio.getTime())) {
        return res.status(422).json(failure('Esa hora no es válida.'))
      }

      if (inicio <= new Date()) {
        return res.status(422).json(failure('Esa hora ya pasó. Elige otra.'))
      }

      const fin = new Date(inicio.getTime() + DURACION_MINIMA * 60000)

      /**
       * Se vuelve a comprobar que el hueco siga libre.
       *
       * Entre que la persona abrió la pantalla y pulsó, pueden pasar minutos, y
       * en ese rato coordinación pudo agendarle a otra persona esa misma hora.
       * Confiar en la lista que ya tiene el navegador es como confiar en el
       * precio de una pestaña abierta ayer.
       */
      const libres = await huecosDisponibles({
        professionalId: asignacion.professionalId,
        desde: new Date(inicio.getTime() - 60000),
        hasta: new Date(fin.getTime() + 60000),
        duracionMinutos: DURACION_MINIMA,
        modalidad: modalidadDeAgenda(paciente.preferredModality),
        /**
         * El margen también se exige AQUÍ, no solo al pintar la lista.
         *
         * La lista es una sugerencia del servidor; esto es la puerta. Sin
         * repetirlo, bastaba con mandar la petición a mano —o con una pestaña
         * abierta desde antes— para reservar algo que empieza en diez minutos,
         * que es justo lo que el margen viene a impedir.
         *
         * Una regla que solo vive en la pantalla no es una regla.
         */
        antelacionHoras,
      })
      const sigueLibre = libres.some((h) => new Date(h.inicio).getTime() === inicio.getTime())
      if (!sigueLibre) {
        // Se distingue de «ya la tomaron»: decirle que alguien se le adelantó
        // cuando lo que pasa es que eligió demasiado pronto la manda a buscar
        // un culpable que no existe.
        const demasiadoPronto =
          inicio.getTime() <= Date.now() + antelacionHoras * 3600000

        return res
          .status(409)
          .json(
            failure(
              demasiadoPronto
                ? `Esa hora ya está muy cerca. Necesitamos al menos ${antelacionHoras} horas para avisarle al profesional y dejar todo listo. Elige una un poco más adelante.`
                : 'Justo acaban de tomar esa hora. Elige otra, por favor.',
            ),
          )
      }

      /**
       * La firma, después de la hora y antes de crear nada.
       *
       * Después de la hora porque los mensajes se estorban: a quien elige una
       * hora que acaban de tomar hay que decirle eso, no que acepte un
       * consentimiento que no va a servirle para esa hora.
       *
       * Antes de crear porque es toda la diferencia con el flujo viejo: si
       * falta la firma, no queda ninguna hora ocupada esperando por ella.
       *
       * Se valida con el mismo esquema que la pantalla del consentimiento —el
       * nombre tecleado es la firma, la versión dice qué texto aceptó—: dos
       * reglas para lo mismo acaban aceptando en una puerta lo que la otra
       * rechaza.
       */
      let firma = null
      if (!(await yaFirmoAlgunaVez(paciente.id))) {
        const leido = firmarConsentimientoSchema.safeParse(req.body?.consentimiento ?? {})
        if (!leido.success) {
          return res
            .status(422)
            .json(
              failure(
                leido.error.issues[0]?.message ??
                  'Para agendar tu sesión necesitamos que aceptes el consentimiento.',
              ),
            )
        }
        firma = leido.data
      }

      const modalidad = modalidadDeSesion(
        paciente.preferredModality,
        asignacion.professional.modality,
      )

      /**
       * Nace CONFIRMADA porque ya no le falta nada.
       *
       * Antes nacía APARTADA y se confirmaba con una firma posterior, en otra
       * pantalla. Ahora la firma viene en esta misma petición —o ya estaba de
       * una sesión anterior—, así que no queda ningún trámite en el aire que
       * justifique un estado intermedio.
       *
       * Si firma ahora, se escribe aquí: es la primera sesión y no hay de
       * dónde heredarla. Si ya había firmado, `crearCita` la hereda sola y
       * `firma` es null.
       */
      const conFirma = firma ? { consentSigned: true, consentSignedAt: new Date() } : {}

      const cita =
        asignacion.status === 'ACEPTADA'
          ? (await confirmarHorario({
              asignacionId: asignacion.id,
              inicio,
              fin,
              modalidad,
              estado: 'CONFIRMADA',
              ...conFirma,
              actorId: null,
            })).cita
          : await crearCita({
              professionalId: asignacion.professionalId,
              patientId: paciente.id,
              inicio,
              fin,
              modalidad,
              estado: 'CONFIRMADA',
              ...conFirma,
              actorId: null,
            })

      /**
       * Quién firmó queda en la auditoría, no en la cita: el nombre que teclea
       * la persona es su firma, y una firma es un hecho que se registra, no un
       * dato que se edita. Mismo rastro que deja la pantalla del
       * consentimiento, para que las dos puertas se lean igual.
       */
      if (firma) {
        await registrar({
          req,
          action: ACCION.EDITAR,
          entity: 'cita_consentimiento',
          entityId: cita.id,
          actorEmail: paciente.email || `${paciente.fullName} (persona)`,
          after: {
            consentSigned: true,
            firma: firma.nombreFirma,
            version: firma.version,
            alAgendar: true,
          },
        })
      }

      /**
       * Avisarle al profesional. Sin esto, la persona agenda y él no se entera.
       *
       * `citaAgendada` se dispara desde el controlador del portal, no desde
       * `crearCita`, así que cada camino nuevo que cree una cita tiene que
       * acordarse de llamarlo. Es la misma forma que ya causó problemas antes:
       * una regla que se decide en cada sitio en vez de en uno. Lo correcto
       * sería moverlo dentro del servicio; mientras tanto, aquí queda anotado
       * por qué está repetido.
       */
      await citaAgendada({
        cita,
        profesional: asignacion.professional,
        cuando: enPalabras(cita.startsAt),
      })

      // Quien agendó fue la persona, no la coordinación. El rastro tiene que
      // decirlo: si alguien revisa por qué apareció esta cita, la respuesta no
      // es «no se sabe».
      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'cita',
        entityId: cita.id,
        actorEmail: `persona:${primerNombre(paciente.fullName) ?? 'acompañada'}`,
        after: { inicio, autogestion: true, profesional: asignacion.professional.fullName },
      })

      return res.status(201).json(
        created(
          {
            inicio: cita.startsAt,
            cuando: enPalabras(cita.startsAt),
            profesional: asignacion.professional.fullName,
            // Siempre firmada: sin firma no se llega hasta aquí.
            consentimiento: { firmado: cita.consentSigned === true },
            esMenor: paciente.isMinor ?? false,
          },
          'Listo, tu sesión quedó agendada.',
        ),
      )
    } catch (error) {
      // Los choques de agenda del servicio de citas son errores de dominio con
      // mensaje entendible; que lleguen tal cual y no como un 500.
      if (error?.codigo || error?.code === 'AGENDA_OCUPADA') {
        return res.status(409).json(failure(error.message))
      }
      return next(error)
    }
  },
}
