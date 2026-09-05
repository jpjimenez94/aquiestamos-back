import { cerrarSesionesConPrueba } from '../citas/cierre.js'
import { devolverALaCola } from '../services/appointment.service.js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { AvailabilityModel } from '../models/availability.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { CaseReportModel } from '../models/caseReport.model.js'
import { casoCompartido, casoPropuesto } from '../views/patient.view.js'
import { reporteListaParaProfesional, reporteParaProfesional } from '../views/caseReport.view.js'
import { ok, created, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { reporteRecibido, propuestaRespondida } from '../notifications/eventos.js'
import { env } from '../config/env.js'
import { exigirTransicion } from '../services/assignmentState.service.js'
import { franjasEnPalabras } from '../services/scheduling.service.js'

/**
 * CONTROLADOR: caso compartido.
 *
 * Un profesional de la red no necesita cuenta para ver el caso que le
 * asignaron: quien coordina le pasa un enlace y el confirma su correo.
 *
 * Esta es la unica ruta publica que devuelve datos de un paciente, asi que
 * carga con tres reglas que el resto del backend obtiene de `authenticate`:
 *
 *   1. El token se firma con un secreto propio y lleva vencimiento adentro.
 *   2. Cada lectura vuelve a comprobar que la asignacion siga ACTIVA. Cerrar
 *      el caso en el portal corta el acceso de una, sin esperar a que venza.
 *   3. La respuesta la arma una vista que nombra campo por campo lo que sale.
 */

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

/**
 * El cuerpo va en base64url, que no contiene puntos, de modo que el punto
 * separa cuerpo y firma sin ambiguedad. (Un formato `uuid:correo.firma` se
 * rompe con cualquier correo que tenga un punto antes de la arroba.)
 */
function crearToken(patientId, professionalId) {
  const cuerpo = Buffer.from(
    JSON.stringify({
      paciente: patientId,
      profesional: professionalId,
      vence: Date.now() + env.sharedCaseTtlHours * 3600 * 1000,
    }),
  ).toString('base64url')

  return `${cuerpo}.${firmar(cuerpo)}`
}

function leerToken(token, patientId) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const corte = token.lastIndexOf('.')
  if (corte < 1) return null

  const cuerpo = token.slice(0, corte)
  const firma = token.slice(corte + 1)
  const esperada = firmar(cuerpo)

  // Comparacion de tiempo constante: `!==` corta en el primer byte distinto y
  // filtra, por el tiempo de respuesta, cuanto acerto quien lo intenta.
  if (firma.length !== esperada.length) return null
  if (!timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null

  let datos
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (datos?.paciente !== patientId) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}

export async function authorizeSharedCase(req, res, next) {
  try {
    const { id } = req.params
    const correo = String(req.body?.email ?? '').trim().toLowerCase()

    if (!correo) {
      return res.status(400).json(failure('El correo es obligatorio.'))
    }

    // Se busca por el caso y se compara el correo, no al reves. Buscar primero
    // al profesional y responder distinto segun exista o no convierte la ruta
    // en un buscador de quien pertenece a la red.
    //
    // Vale cualquier negociacion abierta, no solo la ACTIVA: el profesional
    // entra por aqui precisamente para decir si acepta.
    const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(id)
    const profesional = asignacion?.professional

    const coincide =
      Boolean(profesional) &&
      profesional.status === 'ACTIVO' &&
      !profesional.deletedAt &&
      profesional.email.trim().toLowerCase() === correo

    if (!coincide) {
      // Un solo mensaje para todos los casos: enlace inventado, caso cerrado,
      // correo de otra persona. Desde afuera no se distinguen.
      await registrar({
        req,
        action: ACCION.ACCESO_FALLIDO,
        entity: 'CasoCompartido',
        entityId: id,
        actorEmail: correo,
        after: { correo },
      })
      return res
        .status(403)
        .json(failure('Ese correo no tiene un caso activo con este enlace.'))
    }

    await registrar({
      req,
      action: ACCION.ACCEDER,
      entity: 'CasoCompartido',
      entityId: id,
      actorEmail: profesional.email,
      after: { correo, profesionalId: profesional.id },
    })

    return res.json(ok({ token: crearToken(id, profesional.id) }))
  } catch (error) {
    return next(error)
  }
}

export async function getSharedCase(req, res, next) {
  try {
    const { id } = req.params

    const datos = leerToken(req.headers['x-shared-case-token'], id)
    if (!datos) {
      return res
        .status(401)
        .json(failure('El acceso venció. Vuelve a ingresar tu correo.'))
    }

    // El token dice quien entro; la base dice si eso sigue siendo cierto.
    const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(id)
    if (!asignacion || asignacion.professionalId !== datos.profesional) {
      return res.status(403).json(failure('Este caso ya no está a tu cargo.'))
    }

    const paciente = await PatientModel.findById(id)
    if (!paciente || paciente.deletedAt) {
      return res.status(404).json(failure('No encontramos el caso.'))
    }

    /**
     * Todavía no ha aceptado: se le enseña lo justo para decidir.
     *
     * Dónde está la persona, cómo prefiere que sea el acompañamiento y cuándo
     * puede. Ni nombre, ni teléfono, ni correo. Si dice que no, no se lleva
     * los datos de alguien que nunca fue su caso — y eso importa más aquí que
     * en ninguna otra pantalla, porque a esta se entra con un enlace y un
     * correo, no con una cuenta.
     */
    if (asignacion.status === 'PROPUESTA') {
      return res.json(
        ok({
          estado: asignacion.status,
          decidir: true,
          caso: casoPropuesto(paciente),
        }),
      )
    }

    const [citas, reportes] = await Promise.all([
      AppointmentModel.findDePaciente(id),
      CaseReportModel.findDeAsignacion(asignacion.id),
    ])

    return res.json(
      ok({
        estado: asignacion.status,
        decidir: false,
        /**
         * Puede decir que no, y hasta cuándo.
         *
         * El caso se le asigna sin preguntarle, así que la puerta de salida
         * tiene que estar a la vista mientras no haya nadie esperándole al otro
         * lado. En cuanto la persona elige hora —ACTIVA— ya hay una cita
         * puesta: eso deja de ser declinar y pasa a ser cancelar, que se hace
         * con coordinación y no de un clic.
         */
        puedeDeclinar: asignacion.status === 'ACEPTADA',
        /**
         * Si ya dijo que puede. Cambia la pregunta, no la puerta.
         *
         * Sin esto, su pantalla le seguía preguntando «¿puedes tomarlo?»
         * después de que hubiera contestado que sí, mientras la ficha de
         * coordinación ya lo daba por confirmado. Dos pantallas del mismo
         * sistema diciendo cosas distintas sobre lo mismo.
         *
         * Puede seguir echándose atrás mientras nadie tenga hora reservada:
         * eso lo decide `puedeDeclinar`, que es otra cosa.
         */
        confirmadoEn: asignacion.professionalConfirmedAt,
        /**
         * SU agenda, la que la persona va a ver para elegir.
         *
         * Es el dato que le faltaba para poder contestar. El mensaje que le
         * llega dice que ella elegirá «entre los espacios que ya tienes
         * marcados como libres» y le pide confirmarlos — pero él no los ve por
         * ningún lado: su agenda la mantiene coordinación desde la ficha, y
         * aquí entra con un enlace y su correo, no con una cuenta de portal.
         *
         * Sin esto, «confirma que siguen vigentes» le pide una firma a ciegas,
         * y de ahí salen las cancelaciones tardías: las que dejan a alguien
         * esperando el día de la sesión.
         */
        agenda: await franjasEnPalabras(asignacion.professionalId),
        /**
         * Las mismas franjas, en crudo, para poder editarlas.
         *
         * `agenda` es la frase que se lee; esto es lo que se corrige. Van las
         * dos porque el texto en palabras lo arma el backend con las etiquetas
         * de días y las horas legibles, y rehacerlo en la pantalla sería tener
         * dos versiones de lo mismo esperando a separarse.
         */
        franjas: (await AvailabilityModel.reglasDe(asignacion.professionalId)).map((r) => ({
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          modality: r.modality,
        })),
        ...casoCompartido(paciente, citas),
        reportes: reporteListaParaProfesional(reportes),
      }),
    )
  } catch (error) {
    return next(error)
  }
}

/**
 * POST /api/shared-cases/:id/reporte
 *
 * El profesional cuenta qué pasó con su asignación. Es la única forma que
 * tiene de responder: no tiene cuenta en el portal, solo el enlace.
 */
export async function reportarCaso(req, res, next) {
  try {
    const { id } = req.params

    const datos = leerToken(req.headers['x-shared-case-token'], id)
    if (!datos) {
      return res
        .status(401)
        .json(failure('El acceso venció. Vuelve a ingresar tu correo.'))
    }

    // Las mismas dos comprobaciones que para leer: el token dice quién es, la
    // base dice si el caso sigue siendo suyo.
    const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(id)
    if (!asignacion || asignacion.professionalId !== datos.profesional) {
      return res.status(403).json(failure('Este caso ya no está a tu cargo.'))
    }

    const input = req.validated
    const hubo = ['CITA_ACORDADA', 'YA_ATENDIDA'].includes(input.outcome)

    const creado = await CaseReportModel.create({
      assignmentId: asignacion.id,
      outcome: input.outcome,
      // La modalidad y la fecha solo tienen sentido si hubo o habrá encuentro.
      modality: hubo ? (input.modality ?? null) : null,
      meetsAt: hubo ? (input.meetsAt ?? null) : null,
      contactDifficulties: input.contactDifficulties || null,
      notes: input.notes || null,
      // Qué sigue solo aplica a una sesión hecha: en los demás resultados se
      // descarta aunque llegue, para que el dato no mienta.
      followUp: input.outcome === 'YA_ATENDIDA' ? (input.followUp ?? null) : null,
      reportedByEmail: asignacion.professional.email,
    })

    await reporteRecibido({ reporte: creado, asignacion })

    // Si el reporte dice qué pasó con una sesión ya pasada, la cita se cierra
    // ahora mismo. Con el barrido de cada hora bastaría, pero quien coordina
    // abre la ficha al recibir el correo del reporte: mejor que la encuentre
    // ya cerrada.
    await cerrarSesionesConPrueba({ patientId: id })

    await registrar({
      req,
      action: ACCION.CREAR,
      entity: 'ReporteDeCaso',
      entityId: creado.id,
      actorEmail: asignacion.professional.email,
      after: { caso: id, resultado: creado.outcome },
    })

    return res.status(201).json(
      created(reporteParaProfesional(creado), 'Gracias. Quedó registrado.'),
    )
  } catch (error) {
    return next(error)
  }
}

/**
 * PUT /api/shared-cases/:id/disponibilidad
 *
 * El profesional corrige su propia agenda desde su enlace.
 *
 * Le pedimos confirmar que sus espacios «siguen vigentes» y, si cambiaron, que
 * nos lo diga — pero no tenía dónde decirlo ni cómo cambiarlo. La única ruta
 * para editar disponibilidad exige cuenta de portal (`disponibilidad:editar:propia`)
 * y él no tiene: el correo de aprobación le dice, a propósito, que no necesita
 * contraseña. Así que la petición se quedaba en un «escríbenos» sin destinatario.
 *
 * El token manda sobre el parámetro: se edita la agenda del profesional que
 * lleva ESE caso, nunca la del identificador que venga en la URL. Es la misma
 * regla que el resto de esta pantalla — el enlace no es una credencial para
 * moverse por el sistema, es una llave para una puerta concreta.
 */
export async function actualizarDisponibilidad(req, res, next) {
  try {
    const { id } = req.params

    const datos = leerToken(req.headers['x-shared-case-token'], id)
    if (!datos) {
      return res.status(401).json(failure('El acceso venció. Vuelve a ingresar tu correo.'))
    }

    const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(id)
    if (!asignacion || asignacion.professionalId !== datos.profesional) {
      return res.status(403).json(failure('Este caso ya no está a tu cargo.'))
    }

    const anteriores = await AvailabilityModel.reglasDe(asignacion.professionalId)
    await AvailabilityModel.reemplazarReglas(asignacion.professionalId, req.validated.franjas)
    const nuevas = await AvailabilityModel.reglasDe(asignacion.professionalId)

    // Tocar la agenda ES confirmarla, aquí y en el portal: si no contara, el
    // barrido seguiría preguntándole cada mes a quien acaba de actualizarla.
    await ProfessionalModel.update(asignacion.professionalId, {
      availabilityConfirmedAt: new Date(),
    })

    /**
     * Corregir la agenda NO confirma el caso, y es a propósito.
     *
     * Aquí se llamaba a `confirmar()`: se razonó que dejar la agenda al día
     * decía más que pulsar un botón. Es una inferencia, y era mala. «Mi agenda
     * es esta» y «me quedo con este caso» son dos afirmaciones distintas: puede
     * estar poniendo sus horarios al día mientras todavía decide, o para
     * enseñar por qué NO puede tomarlo.
     *
     * Se vio en pantalla: guardaba sus horarios, la ficha daba el caso por
     * confirmado, y su propia pantalla le seguía preguntando «¿puedes
     * tomarlo?». El sistema afirmaba en su nombre algo que él no había dicho.
     *
     * Confirmar sigue siendo el botón de «Sí puedo, sigo con el caso». Lo que
     * sí actualiza esto es `availabilityConfirmedAt`, que es otra cosa: cuándo
     * se revisó por última vez la agenda.
     */
    await registrar({
      req,
      action: ACCION.EDITAR,
      entity: 'disponibilidad',
      entityId: asignacion.professionalId,
      actorEmail: datos.email ?? null,
      before: { franjas: anteriores.length },
      after: { franjas: nuevas.length, desde: 'enlace del caso' },
    })

    return res.json(ok({ franjas: nuevas.length }))
  } catch (error) {
    return next(error)
  }
}

/**
 * POST /api/shared-cases/:id/propuesta
 *
 * El profesional confirma que puede, o dice que no.
 *
 * Ya no pide horarios: su agenda está en su perfil y es de ahí de donde la
 * persona elige. Pedírselos otra vez, caso por caso, era pedirle dos veces lo
 * mismo en el paso donde se moría una de cada dos asignaciones.
 *
 * Lo que queda es la salida. El caso se le asigna sin preguntarle, así que
 * decir «ahora no puedo» tiene que costarle un toque y llegar aquí; si no,
 * asignar sin preguntar deja de ser eficiencia y pasa a ser imposición.
 */
export async function responderPropuesta(req, res, next) {
  try {
    const { id } = req.params

    const datos = leerToken(req.headers['x-shared-case-token'], id)
    if (!datos) {
      return res.status(401).json(failure('El acceso venció. Vuelve a ingresar tu correo.'))
    }

    const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(id)
    if (!asignacion || asignacion.professionalId !== datos.profesional) {
      return res.status(403).json(failure('Este caso ya no está a tu cargo.'))
    }

    const { acepta, nota, motivo } = req.validated

    /**
     * La máquina de estados decide si esto es legal.
     *
     * Ahora la asignación nace ACEPTADA, así que aceptar desde ahí no es una
     * transición: es repetir lo que ya está. Solo se mueve algo cuando declina.
     * Confirmar sigue aceptándose sin error porque el mensaje le invita a
     * responder, y contestar «sí puedo» no puede devolverle un fallo.
     */
    if (!acepta) {
      exigirTransicion(asignacion.status, 'RECHAZADA')
    } else if (asignacion.status === 'PROPUESTA') {
      // Las de antes del cambio sí tienen que pasar de PROPUESTA a ACEPTADA.
      exigirTransicion(asignacion.status, 'ACEPTADA')
    }

    /**
     * Confirmar no mueve el estado, pero sí tiene que dejar rastro.
     *
     * Antes devolvía la asignación intacta: no se escribía nada. Y como el
     * barrido libera por `respondedAt` —que se puso al asignar—, decir «sí
     * puedo» no aplazaba nada. El profesional que contestaba a los dos días
     * perdía el caso al tercero exactamente igual que si no hubiera abierto el
     * enlace.
     */
    const actualizada = acepta && asignacion.status === 'ACEPTADA'
      ? await CaseAssignmentModel.confirmar(asignacion.id, { nota })
      : await CaseAssignmentModel.responder(asignacion.id, { acepta, nota, motivo })

    // Al declinar, el caso tiene que volver a verse en «Por asignar». Sin esto
    // la persona se queda sin profesional Y fuera de la lista: invisible para
    // quien coordina, que es como se pierde a alguien sin que salte nada.
    if (!acepta) {
      await devolverALaCola(asignacion.patientId)
    }

    await propuestaRespondida({ asignacion: actualizada, profesional: asignacion.professional })

    await registrar({
      req,
      action: ACCION.EDITAR,
      entity: 'asignacion',
      entityId: asignacion.id,
      actorEmail: asignacion.professional.email,
      before: { estado: asignacion.status },
      after: {
        estado: actualizada.status,
        respondioProfesional: asignacion.professional.email,
        acepta,
        nota: nota || null,
        motivo: motivo || null,
      },
    })

    return res.json(
      ok(
        { estado: actualizada.status },
        acepta
          ? 'Gracias. Vamos a cuadrar el horario y te escribimos.'
          : 'Gracias por avisarnos. Le buscamos otro acompañamiento.',
      ),
    )
  } catch (error) {
    return next(error)
  }
}
