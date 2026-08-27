import { Router } from 'express'
import { SettingsController } from '../controllers/settings.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { validateBody } from '../middlewares/validate.js'
import { updateSettingSchema, previewSettingSchema } from '../validators/settings.schema.js'

export const settingsRoutes = Router()

// Todas las rutas requieren autenticación
settingsRoutes.use(authenticate)

settingsRoutes.get('/', authorize('configuracion:leer'), SettingsController.index)
settingsRoutes.get('/:key', authorize('configuracion:leer'), SettingsController.show)
settingsRoutes.patch('/:key', authorize('configuracion:editar'), validateBody(updateSettingSchema), SettingsController.update)
settingsRoutes.post('/:key/reset', authorize('configuracion:editar'), SettingsController.reset)
settingsRoutes.post('/preview', authorize('configuracion:leer'), validateBody(previewSettingSchema), SettingsController.preview)
