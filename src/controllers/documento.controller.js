import {
  guardarDocumento,
  urlFirmada,
  esClaveDeAlmacenamiento,
  CARPETAS,
  TIPOS_ACEPTADOS,
  TAMANO_MAXIMO,
} from '../almacenamiento/documentos.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'

/**
 * CONTROLADOR: documentos.
 *
 * Tarjetas profesionales, certificados de estudio y consentimientos firmados.
 * Antes esto lo hacía una ruta de Next que escribía en `public/`: sin sesión,
 * sin permisos y sirviendo el resultado al mundo entero. Ahora pasa por aquí,
 * que es donde vive la autoridad sobre quién puede qué.
 *
 * La diferencia que más importa no es el bucket privado: es que consultar un
 * documento de identidad queda en `audit_log` con nombre y hora. Con datos así
 * de sensibles, saber quién miró no es un extra, es la mitad del control.
 */
export const DocumentoController = {
  /**
   * POST /api/documentos?carpeta=tarjetas
   *
   * El cuerpo son los bytes del archivo tal cual, no un multipart. El portal
   * ya deshizo el formulario; mandar los bytes directos evita meter un parser
   * de multipart en el backend para un único endpoint.
   */
  async subir(req, res, next) {
    try {
      const carpeta = String(req.query.carpeta ?? 'documentos')
      const tipo = String(req.get('x-tipo-archivo') ?? req.get('content-type') ?? '')
        .split(';')[0]
        .trim()

      const { clave, tamano } = await guardarDocumento({
        carpeta,
        tipo,
        bytes: req.body,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'documento',
        entityId: clave,
        after: { carpeta, tipo, tamano },
      })

      // Lo que se guarda en la base es la clave. Nunca una URL: caduca.
      return res.status(201).json(created({ clave }, 'Documento guardado.'))
    } catch (error) {
      return next(error)
    }
  },

  /**
   * GET /api/documentos/:carpeta/:nombre
   *
   * Devuelve una URL firmada que dura un minuto, no el archivo. Así el
   * documento no pasa por el backend y el enlace que alguien pueda reenviar
   * ya no sirve cuando llegue.
   */
  async ver(req, res, next) {
    try {
      const clave = `${req.params.carpeta}/${req.params.nombre}`

      if (!esClaveDeAlmacenamiento(clave)) {
        return res.status(404).json(failure('Ese documento no existe'))
      }

      const firmada = await urlFirmada(clave)

      // Quién miró qué documento de identidad, y cuándo. Es el punto de todo
      // esto: la carpeta anterior no dejaba ningún rastro.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'documento',
        entityId: clave,
      })

      return res.json(ok(firmada))
    } catch (error) {
      return next(error)
    }
  },

  /** GET /api/documentos/limites — lo que el portal necesita para validar antes de subir. */
  async limites(req, res) {
    return res.json(
      ok({
        carpetas: CARPETAS,
        tiposAceptados: Object.keys(TIPOS_ACEPTADOS),
        tamanoMaximo: TAMANO_MAXIMO,
      }),
    )
  },
}
