import { Router } from 'express'
import { ProfessionalController } from '../controllers/professional.controller.js'
import { PatientController } from '../controllers/patient.controller.js'
import { AppointmentController } from '../controllers/appointment.controller.js'
import { AvailabilityController } from '../controllers/availability.controller.js'
import { DashboardController } from '../controllers/dashboard.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { validateBody } from '../middlewares/validate.js'
import {
  crearCitaSchema,
  cambiarEstadoSchema,
  reprogramarSchema,
  asignarCasoSchema,
  cerrarCasoSchema,
  reemplazarFranjasSchema,
  crearBloqueoSchema,
  aprobarPostulacionSchema,
  admitirSolicitudSchema,
  editarProfesionalSchema,
  editarPacienteSchema,
  actualizarTarjetaProfesionalSchema,
  actualizarConsentimientoSchema,
} from '../validators/agenda.schema.js'

// ---------------------------------------------------------------- profesionales
export const professionalRoutes = Router()
professionalRoutes.use(authenticate)

professionalRoutes.get('/', authorize('profesional:leer'), ProfessionalController.index)
professionalRoutes.get('/:id', authorize('profesional:leer'), ProfessionalController.show)

professionalRoutes.post(
  '/aprobar/:volunteerId',
  authorize('profesional:crear'),
  validateBody(aprobarPostulacionSchema),
  ProfessionalController.aprobar,
)
professionalRoutes.patch(
  '/:id',
  authorize('profesional:editar'),
  validateBody(editarProfesionalSchema),
  ProfessionalController.update,
)
// Verificar la tarjeta tiene permiso propio y no va con `profesional:editar`:
// quien lleva el WhatsApp con el profesional sube su soporte, pero no le toca
// el cupo de casos ni le enlaza una cuenta del portal.
professionalRoutes.patch(
  '/:id/tarjeta-profesional',
  authorize('profesional:verificar-tarjeta'),
  validateBody(actualizarTarjetaProfesionalSchema),
  ProfessionalController.actualizarTarjetaProfesional,
)
professionalRoutes.delete('/:id', authorize('profesional:borrar'), ProfessionalController.destroy)

// Disponibilidad: el propio profesional puede editar la suya, y el controlador
// comprueba que sea la suya. Por eso no lleva `authorize` de rol.
professionalRoutes.get('/:id/disponibilidad', AvailabilityController.index)
professionalRoutes.put(
  '/:id/disponibilidad',
  validateBody(reemplazarFranjasSchema),
  AvailabilityController.reemplazar,
)
professionalRoutes.post(
  '/:id/bloqueos',
  validateBody(crearBloqueoSchema),
  AvailabilityController.crearBloqueo,
)
professionalRoutes.delete('/:id/bloqueos/:bloqueoId', AvailabilityController.borrarBloqueo)

// ---------------------------------------------------------------- personas
export const patientRoutes = Router()
patientRoutes.use(authenticate)

patientRoutes.get('/', authorize('paciente:leer'), PatientController.index)
patientRoutes.get('/:id', authorize('paciente:leer'), PatientController.show)
patientRoutes.get('/:id/candidatos', authorize('asignacion:crear'), PatientController.candidatos)

patientRoutes.post(
  '/admitir/:supportRequestId',
  authorize('paciente:crear'),
  validateBody(admitirSolicitudSchema),
  PatientController.admitir,
)
patientRoutes.patch(
  '/:id',
  authorize('paciente:editar'),
  validateBody(editarPacienteSchema),
  PatientController.update,
)
patientRoutes.delete('/:id', authorize('paciente:borrar'), PatientController.destroy)

// ---------------------------------------------------------------- agenda
export const appointmentRoutes = Router()
appointmentRoutes.use(authenticate)

// Las rutas fijas van antes que `/:id`, si no `huecos` se leería como un id.
appointmentRoutes.get('/huecos', authorize('agenda:leer'), AppointmentController.huecos)
appointmentRoutes.get('/historial', authorize('agenda:leer'), AppointmentController.historial)
appointmentRoutes.get('/mias', authorize('agenda:leer:propia'), AppointmentController.mias)

appointmentRoutes.get('/', authorize('agenda:leer'), AppointmentController.index)
appointmentRoutes.get('/:id', authorize('agenda:leer'), AppointmentController.show)

appointmentRoutes.post('/', authorize('cita:crear'), validateBody(crearCitaSchema), AppointmentController.store)
appointmentRoutes.patch(
  '/:id/estado',
  authorize('cita:confirmar'),
  validateBody(cambiarEstadoSchema),
  AppointmentController.cambiarEstado,
)
appointmentRoutes.patch(
  '/:id/consentimiento',
  authorize('cita:confirmar'),
  validateBody(actualizarConsentimientoSchema),
  AppointmentController.actualizarConsentimiento,
)
appointmentRoutes.post(
  '/:id/reprogramar',
  authorize('cita:reprogramar'),
  validateBody(reprogramarSchema),
  AppointmentController.reprogramar,
)

appointmentRoutes.post(
  '/asignar',
  authorize('asignacion:crear'),
  validateBody(asignarCasoSchema),
  AppointmentController.asignar,
)
appointmentRoutes.post(
  '/asignaciones/:id/cerrar',
  authorize('asignacion:cerrar'),
  validateBody(cerrarCasoSchema),
  AppointmentController.cerrarAsignacion,
)

// ---------------------------------------------------------------- tablero
export const dashboardRoutes = Router()
dashboardRoutes.get('/', authenticate, authorize('agenda:leer'), DashboardController.index)
dashboardRoutes.get('/tablero', authenticate, authorize('agenda:leer'), DashboardController.tablero)
