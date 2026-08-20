import { Router } from 'express'
import { authorizeSharedCase, getSharedCase } from '../controllers/sharedCase.controller.js'
import { validarParamsUuid } from '../middlewares/validarUuid.js'

const router = Router()

// No requieren sesión general porque usan su propia validación.
router.post('/:id/auth', validarParamsUuid, authorizeSharedCase)
router.get('/:id', validarParamsUuid, getSharedCase)

export default router
