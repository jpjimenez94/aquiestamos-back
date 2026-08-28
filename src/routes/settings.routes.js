import { Router } from 'express'
import { SettingsController } from '../controllers/settings.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { validateBody } from '../middlewares/validate.js'
import { updateSettingSchema, previewSettingSchema } from '../validators/settings.schema.js'

export const settingsRoutes = Router()

// Todas las rutas requieren autenticación
settingsRoutes.use(authenticate)

/**
 * Los textos de los mensajes: basta con haber iniciado sesión.
 *
 * Va ANTES que `/:key` a propósito; si no, Express leería «plantillas» como
 * una clave de configuración y devolvería 404.
 *
 * Sin `authorize` porque el AGENDADOR —quien manda estos mensajes todo el
 * día— no tiene `configuracion:leer`. Exigírselo dejaría la ficha de una
 * persona sin poder pintar el texto que está a punto de enviarse.
 */
settingsRoutes.get('/plantillas', SettingsController.plantillas)

settingsRoutes.get('/', authorize('configuracion:leer'), SettingsController.index)
settingsRoutes.get('/:key', authorize('configuracion:leer'), SettingsController.show)
settingsRoutes.patch('/:key', authorize('configuracion:editar'), validateBody(updateSettingSchema), SettingsController.update)
settingsRoutes.post('/:key/reset', authorize('configuracion:editar'), SettingsController.reset)
settingsRoutes.post('/preview', authorize('configuracion:leer'), validateBody(previewSettingSchema), SettingsController.preview)
