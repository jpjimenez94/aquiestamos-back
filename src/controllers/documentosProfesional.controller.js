import { prisma } from '../config/database.js'
import { leerEnlaceDocumentos } from '../auth/enlaceDocumentos.js'
import {
  guardarDocumento,
  esClaveDeAlmacenamiento,
  hayAlmacenamientoConfigurado,
} from '../almacenamiento/documentos.js'
import { capturarError } from '../monitoreo/errores.js'
import { ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { documentosRecibidos } from '../notifications/eventos.js'

/**
 * CONTROLADOR: los documentos del profesional, subidos por él mismo.
 *
 * La puerta pública por la que el profesional sube su tarjeta (o certificado)
 * y su documento de identidad, directo al bucket privado: WhatsApp nunca toca
 * el archivo. Al enviar, coordinación recibe el aviso y el perfil pasa a
 * «pendiente de aprobación» en la pantalla de verificaciones.
 *
 * Mismas reglas de toda puerta pública: token firmado, respuestas idénticas
 * para token inventado y perfil borrado, y lo mínimo en la vista.
 */

async function profesionalDelToken(token) {
  const datos = leerEnlaceDocumentos(token)
  if (!datos) return null

  return prisma.professional.findFirst({
    where: { id: datos.profesional, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      professionalCardVerified: true,
      professionalCardNumber: true,
      documentsSubmittedAt: true,
    },
  })
}

function pila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || null
}

function vista(p) {
  return {
    nombre: pila(p.fullName),
    verificado: p.professionalCardVerified === true,
    yaEnviado: p.documentsSubmittedAt != null,
    numeroActual: p.professionalCardNumber ?? null,
  }
}

export const DocumentosProfesionalController = {
  /** GET /api/documentos-profesional/:token */
  async mostrar(req, res, next) {
    try {
      const profesional = await profesionalDelToken(req.params.token)
      if (!profesional) {
        return res
          .status(404)
          .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
      }
      return res.json(ok(vista(profesional)))
    } catch (error) {
      return next(error)
    }
  },

  /**
   * POST /api/documentos-profesional/:token/archivo — un archivo, en crudo.
   * Devuelve la clave del bucket; el envío final referencia esas claves.
   */
  async subirArchivo(req, res, next) {
    try {
      const profesional = await profesionalDelToken(req.params.token)
      if (!profesional) {
        return res.status(404).json(failure('Este enlace ya no sirve.'))
      }
      if (profesional.professionalCardVerified) {
        return res.status(409).json(failure('Tu perfil ya está verificado: no hace falta subir nada más.'))
      }

      /**
       * Si el almacenamiento no está configurado, quien lo sufre es un
       * profesional con su cédula en la mano — y quien puede arreglarlo ni se
       * entera. El aviso a coordinación viaja por el monitoreo (uno por día),
       * y a la persona se le habla claro: no es culpa suya ni de su archivo.
       */
      if (!hayAlmacenamientoConfigurado()) {
        capturarError(
          'almacenamiento sin configurar (subida por enlace)',
          new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno'),
        )
        return res
          .status(503)
          .json(failure('No es tu archivo: tenemos un problema técnico de nuestro lado. Ya avisamos al equipo; intenta más tarde.'))
      }

      const tipo = String(req.get('x-tipo-archivo') ?? req.get('content-type') ?? '')
        .split(';')[0]
        .trim()

      const { clave, tamano } = await guardarDocumento({
        carpeta: 'tarjetas',
        tipo,
        bytes: req.body,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'documento',
        entityId: clave,
        after: { profesional: profesional.id, tamano, desdeEnlace: true },
      })

      return res.json(ok({ clave }))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/documentos-profesional/:token — el envío: claves + número. */
  async enviar(req, res, next) {
    try {
      const profesional = await profesionalDelToken(req.params.token)
      if (!profesional) {
        return res.status(404).json(failure('Este enlace ya no sirve.'))
      }
      if (profesional.professionalCardVerified) {
        return res.json(ok(vista(profesional), 'Tu perfil ya está verificado. Todo en orden.'))
      }

      const { claveTarjeta, claveIdentidad, claveIdentidadRespaldo, numeroTarjeta } = req.validated

      if (!esClaveDeAlmacenamiento(claveTarjeta) || !esClaveDeAlmacenamiento(claveIdentidad)) {
        return res.status(400).json(failure('Falta alguno de los archivos. Súbelos y vuelve a enviar.'))
      }
      if (claveIdentidadRespaldo && !esClaveDeAlmacenamiento(claveIdentidadRespaldo)) {
        return res.status(400).json(failure('El respaldo de la cédula no se subió bien. Súbelo de nuevo.'))
      }

      const actualizado = await prisma.professional.update({
        where: { id: profesional.id },
        data: {
          professionalCardDocumentUrl: claveTarjeta,
          identityDocumentUrl: claveIdentidad,
          identityDocumentBackUrl: claveIdentidadRespaldo || null,
          ...(numeroTarjeta ? { professionalCardNumber: numeroTarjeta } : {}),
          documentsSubmittedAt: new Date(),
        },
        select: {
          id: true,
          fullName: true,
          professionalCardVerified: true,
          professionalCardNumber: true,
          documentsSubmittedAt: true,
        },
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'profesional_tarjeta',
        entityId: profesional.id,
        after: { documentosEnviados: true, desdeEnlace: true },
      })

      await documentosRecibidos({ profesional: actualizado })

      return res.json(
        ok(vista(actualizado), 'Recibido. El equipo los revisa y te confirmamos por WhatsApp.'),
      )
    } catch (error) {
      return next(error)
    }
  },
}
