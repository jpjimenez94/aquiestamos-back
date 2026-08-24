import { Router } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { DocumentosProfesionalController } from '../controllers/documentosProfesional.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { enviarDocumentosSchema } from '../validators/documentosProfesional.schema.js'
import { TAMANO_MAXIMO } from '../almacenamiento/documentos.js'

export const documentosProfesionalRoutes = Router()

// Más estricto que las otras puertas: aquí se suben archivos de 10 MB.
const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
})

documentosProfesionalRoutes.get('/:token', limite, DocumentosProfesionalController.mostrar)

// El archivo llega en crudo, igual que en el upload del portal: sin parser
// de multipart para un solo endpoint.
documentosProfesionalRoutes.post(
  '/:token/archivo',
  limite,
  express.raw({ type: '*/*', limit: TAMANO_MAXIMO }),
  DocumentosProfesionalController.subirArchivo,
)

documentosProfesionalRoutes.post(
  '/:token',
  limite,
  validateBody(enviarDocumentosSchema),
  DocumentosProfesionalController.enviar,
)

export default documentosProfesionalRoutes
