import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { HealthController } from '../controllers/health.controller.js'
import { authRoutes } from './auth.routes.js'
import { userRoutes } from './user.routes.js'
import { auditLogRoutes } from './auditLog.routes.js'
import { volunteerRoutes } from './volunteer.routes.js'
import { supportRequestRoutes } from './supportRequest.routes.js'
import { collaboratorRoutes } from './collaborator.routes.js'
import { resourceRoutes } from './resource.routes.js'
import sharedCaseRoutes from './sharedCase.routes.js'
import { triageRoutes } from './triage.routes.js'
import { documentoRoutes } from './documento.routes.js'
import {
  professionalRoutes,
  patientRoutes,
  appointmentRoutes,
  dashboardRoutes,
} from './agenda.routes.js'

export const apiRoutes = Router()

// Los formularios son públicos: limitamos envíos por IP para evitar spam.
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados envíos desde esta conexión. Intenta de nuevo en unos minutos.',
  },
})

// --- Público ---
apiRoutes.get('/health', HealthController.check)
apiRoutes.use('/resources', resourceRoutes)
apiRoutes.use('/volunteers', formLimiter, volunteerRoutes)
apiRoutes.use('/support-requests', formLimiter, supportRequestRoutes)
apiRoutes.use('/collaborators', formLimiter, collaboratorRoutes)

// --- Casos compartidos (acceso por enlace + correo) ---
apiRoutes.use('/shared-cases', sharedCaseRoutes)

// --- Tamizaje: la persona responde su propio enlace, sin sesión ---
apiRoutes.use('/triage', triageRoutes)

// --- Portal ---
apiRoutes.use('/auth', authRoutes)
apiRoutes.use('/users', userRoutes)
apiRoutes.use('/audit', auditLogRoutes)

// --- Documentos: tarjetas, certificados y consentimientos firmados ---
apiRoutes.use('/documentos', documentoRoutes)

// --- Operación: personas, profesionales y agenda ---
apiRoutes.use('/dashboard', dashboardRoutes)
apiRoutes.use('/professionals', professionalRoutes)
apiRoutes.use('/patients', patientRoutes)
apiRoutes.use('/appointments', appointmentRoutes)
