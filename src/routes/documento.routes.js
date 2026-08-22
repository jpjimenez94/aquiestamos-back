import { Router } from 'express'
import express from 'express'
import { DocumentoController } from '../controllers/documento.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { TAMANO_MAXIMO } from '../almacenamiento/documentos.js'

export const documentoRoutes = Router()

documentoRoutes.use(authenticate)

documentoRoutes.get('/limites', DocumentoController.limites)

/**
 * El cuerpo llega como bytes crudos y no como multipart: el portal deshace el
 * formulario y reenvía el archivo. Así el backend no necesita un parser de
 * multipart para un solo endpoint.
 *
 * El límite va aquí y no en `app.js` a propósito: `express.json` global sigue
 * en 100 kb, que es lo que debe ser. Solo esta ruta acepta 10 MB.
 */
documentoRoutes.post(
  '/',
  authorize('documento:subir'),
  express.raw({ type: '*/*', limit: TAMANO_MAXIMO }),
  DocumentoController.subir,
)

documentoRoutes.get('/:carpeta/:nombre', authorize('documento:leer'), DocumentoController.ver)

export default documentoRoutes
