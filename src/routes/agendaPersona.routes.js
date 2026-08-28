import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { AgendaPersonaController } from '../controllers/agendaPersona.controller.js'

export const agendaPersonaRoutes = Router()

/**
 * La agenda de la persona: pública, como el tamizaje y el consentimiento.
 *
 * Quien la abre no tiene cuenta en el portal, solo su enlace. El límite es
 * holgado porque mirar los huecos y volver a mirarlos es lo normal cuando
 * alguien está decidiendo una hora con el calendario en la otra mano.
 */
const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Espera un momento.' },
})

agendaPersonaRoutes.get('/:token', limite, AgendaPersonaController.mostrar)
agendaPersonaRoutes.post('/:token', limite, AgendaPersonaController.agendar)
