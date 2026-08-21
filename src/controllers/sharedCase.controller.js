import { createHmac, timingSafeEqual } from 'node:crypto'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { PatientModel } from '../models/patient.model.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { CaseReportModel } from '../models/caseReport.model.js'
import { casoCompartido } from '../views/patient.view.js'
import { reporteListaParaProfesional, reporteParaProfesional } from '../views/caseReport.view.js'
import { ok, created, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { reporteRecibido } from '../notifications/eventos.js'
import { env } from '../config/env.js'

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
    const asignacion = await CaseAssignmentModel.findActivaDePaciente(id)
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
    const asignacion = await CaseAssignmentModel.findActivaDePaciente(id)
    if (!asignacion || asignacion.professionalId !== datos.profesional) {
      return res.status(403).json(failure('Este caso ya no está a tu cargo.'))
    }

    const paciente = await PatientModel.findById(id)
    if (!paciente || paciente.deletedAt) {
      return res.status(404).json(failure('No encontramos el caso.'))
    }

    const [citas, reportes] = await Promise.all([
      AppointmentModel.findDePaciente(id),
      CaseReportModel.findDeAsignacion(asignacion.id),
    ])

    return res.json(
      ok({
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
    const asignacion = await CaseAssignmentModel.findActivaDePaciente(id)
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
      reportedByEmail: asignacion.professional.email,
    })

    await reporteRecibido({ reporte: creado, asignacion })

    await registrar({
      req,
      action: ACCION.CREAR,
      entity: 'ReporteDeCaso',
      entityId: creado.id,
      after: { caso: id, resultado: creado.outcome },
    })

    return res.status(201).json(
      created(reporteParaProfesional(creado), 'Gracias. Quedó registrado.'),
    )
  } catch (error) {
    return next(error)
  }
}
