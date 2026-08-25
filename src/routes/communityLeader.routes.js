import { Router } from 'express'
import { CommunityLeaderController } from '../controllers/communityLeader.controller.js'
import { NeedCategoryController } from '../controllers/needCategory.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import {
  crearLiderSchema,
  editarLiderSchema,
  registrarContactoSchema,
  crearCategoriaNecesidadSchema,
  editarCategoriaNecesidadSchema,
} from '../validators/communityLeader.schema.js'

export const communityLeaderRouter = Router()
export const needCategoryRouter = Router()

// Todas las rutas requieren sesión activa
communityLeaderRouter.use(authenticate)
needCategoryRouter.use(authenticate)

/* ==========================================================================
   Líderes Comunitarios
   ========================================================================== */
communityLeaderRouter.get('/summary', authorize('lideres:leer'), CommunityLeaderController.summary)
communityLeaderRouter.get('/', authorize('lideres:leer'), CommunityLeaderController.index)
communityLeaderRouter.get('/:id', authorize('lideres:leer'), CommunityLeaderController.show)
communityLeaderRouter.post('/', authorize('lideres:crear'), validateBody(crearLiderSchema), CommunityLeaderController.create)
communityLeaderRouter.put('/:id', authorize('lideres:editar'), validateBody(editarLiderSchema), CommunityLeaderController.update)
communityLeaderRouter.post('/:id/contacts', authorize('lideres:editar'), validateBody(registrarContactoSchema), CommunityLeaderController.addContact)
communityLeaderRouter.delete('/:id', authorize('lideres:inactivar'), CommunityLeaderController.destroy)

/* ==========================================================================
   Catálogo Dinámico de Necesidades
   ========================================================================== */
needCategoryRouter.get('/', authorize('lideres:leer'), NeedCategoryController.index)
needCategoryRouter.post('/', authorize('necesidades:administrar'), validateBody(crearCategoriaNecesidadSchema), NeedCategoryController.create)
needCategoryRouter.put('/:id', authorize('necesidades:administrar'), validateBody(editarCategoriaNecesidadSchema), NeedCategoryController.update)
needCategoryRouter.delete('/:id', authorize('necesidades:administrar'), NeedCategoryController.destroy)

