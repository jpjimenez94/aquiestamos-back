import { prisma } from '../config/database.js'
import { leerEnlaceDesistimiento } from '../auth/enlaceDesistimiento.js'
import { PatientModel } from '../models/patient.model.js'
import { SettingsService } from '../services/settings.service.js'
import { cerrarCaso } from '../services/appointment.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { desistimientoRegistrado } from '../notifications/eventos.js'
import { ok, failure } from '../views/response.view.js'
import { primerNombre } from '../nombre.js'

/**
 * CONTROLADOR: la constancia de que alguien decidió no tomar el acompañamiento.
 *
 * Hasta ahora un caso se cerraba desde el portal y punto: quedaba el motivo que
 * escribiera coordinación, que es nuestra palabra sobre la decisión de otra
 * persona. Cuando alguien dice «gracias, pero no quiero continuar», lo que hace
 * falta es que lo diga ella, desde su enlace, y que quede qué leyó al decirlo.
 *
 * Qué es y qué no es este documento, porque importa: deja constancia de que se
 * le ofreció el servicio, de que desistió por su propia voluntad y de que
 * quedó informada de las líneas de crisis y de que puede volver. No es —ni
 * puede ser— una renuncia general a nada: eso ni se le pide ni se le insinúa.
 * El texto está en Parametrización, versionado, y se guarda ENTERO con cada
 * constancia: si legal lo cambia mañana, lo que esta persona aceptó sigue ahí.
 *
 * Puerta pública, como el tamizaje o el consentimiento: token firmado, sin
 * sesión. Quien la abre no tiene cuenta en el portal.
 */

async function textoVigente() {
  const [texto, version] = await Promise.all([
    SettingsService.getValue('DESISTIMIENTO_TEXTO', ''),
    SettingsService.getValue('DESISTIMIENTO_VERSION', 'sin-version'),
  ])
  return { texto: String(texto ?? ''), version: String(version ?? 'sin-version') }
}

const vista = (paciente, constancia, texto, version) => ({
  persona: primerNombre(paciente.fullName),
  yaCerrado: paciente.status === 'CERRADO',
  texto,
  version,
  constancia: constancia
    ? { firmadaEl: constancia.signedAt, nombre: constancia.signedName, version: constancia.textVersion }
    : null,
})

export const DesistimientoController = {
  /** GET /api/desistimiento/:token — qué ve al abrir el enlace. */
  async mostrar(req, res, next) {
    try {
      const leido = leerEnlaceDesistimiento(req.params.token)
      if (!leido) {
        return res.status(404).json(failure('Este enlace no es válido o ya venció.'))
      }

      const paciente = await PatientModel.findById(leido.paciente)
      if (!paciente || paciente.deletedAt) {
        return res.status(404).json(failure('No encontramos tu caso.'))
      }

      const { texto, version } = await textoVigente()
      const constancia = await prisma.caseWithdrawal.findFirst({
        where: { patientId: paciente.id },
        orderBy: { signedAt: 'desc' },
      })

      return res.json(ok(vista(paciente, constancia, texto, version)))
    } catch (error) {
      next(error)
    }
  },

  /**
   * POST /api/desistimiento/:token — la persona acepta y el caso se cierra.
   *
   * El cierre va DESPUÉS de guardar la constancia y nunca al revés: si algo
   * fallara en medio, es preferible una constancia sin cierre —que coordinación
   * ve y resuelve— que un caso cerrado sin el documento que lo explica.
   */
  async aceptar(req, res, next) {
    try {
      const leido = leerEnlaceDesistimiento(req.params.token)
      if (!leido) {
        return res.status(404).json(failure('Este enlace no es válido o ya venció.'))
      }

      const paciente = await PatientModel.findById(leido.paciente)
      if (!paciente || paciente.deletedAt) {
        return res.status(404).json(failure('No encontramos tu caso.'))
      }

      const { texto, version } = await textoVigente()

      if (paciente.status === 'CERRADO') {
        const previa = await prisma.caseWithdrawal.findFirst({
          where: { patientId: paciente.id },
          orderBy: { signedAt: 'desc' },
        })
        return res.json(
          ok(vista(paciente, previa, texto, version), 'Tu caso ya estaba cerrado. No hay nada más que hacer.'),
        )
      }

      const { nombre, motivo } = req.validated

      const asignacion = await prisma.caseAssignment.findFirst({
        where: {
          patientId: paciente.id,
          status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] },
          deletedAt: null,
        },
        orderBy: { startedAt: 'desc' },
      })

      const constancia = await prisma.caseWithdrawal.create({
        data: {
          patientId: paciente.id,
          assignmentId: asignacion?.id ?? null,
          signedName: nombre.trim(),
          textVersion: version,
          textSnapshot: texto,
          reason: motivo?.trim() || null,
          ipAddress: (req.headers['x-forwarded-for'] || '').toString().split(',')[0]?.trim() || null,
          userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300) || null,
        },
      })

      // El caso se cierra por la máquina de estados, como cualquier cierre.
      if (asignacion) {
        await cerrarCaso({
          asignacionId: asignacion.id,
          motivo: `La persona desistió del acompañamiento y lo dejó por escrito (constancia ${version}).`,
        })
      }
      await PatientModel.update(paciente.id, { status: 'CERRADO' })

      /**
       * Y se avisa, que es lo que distingue este cierre de los demás.
       *
       * Los otros los hace alguien del equipo delante de la pantalla, que
       * puede escribirle al profesional. Este lo hace ella desde su teléfono
       * a la hora que sea: si nadie manda el aviso, al profesional se le
       * cancelan las sesiones sin una palabra.
       */
      const profesional = asignacion
        ? await prisma.professional.findUnique({ where: { id: asignacion.professionalId } })
        : null
      await desistimientoRegistrado({ paciente, profesional, constancia })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'paciente',
        entityId: paciente.id,
        actorEmail: `paciente:${primerNombre(paciente.fullName)}`,
        before: { estado: paciente.status },
        after: {
          estado: 'CERRADO',
          desistimiento: {
            constanciaId: constancia.id,
            version,
            nombre: constancia.signedName,
            firmadaEl: constancia.signedAt,
          },
        },
      })

      return res.json(
        ok(
          vista({ ...paciente, status: 'CERRADO' }, constancia, texto, version),
          'Gracias por decírnoslo. Tu caso queda cerrado y los teléfonos de emergencia siguen aquí.',
        ),
      )
    } catch (error) {
      next(error)
    }
  },
}
