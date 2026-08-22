import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { DomainError } from '../errors/DomainError.js'

/**
 * Dónde viven los documentos que sube el equipo.
 *
 * Se habla la API REST de Supabase Storage a pelo, sin su SDK, por lo mismo
 * que se hace con Brevo en `notifications/mailerApi.js`: cambiar de proveedor
 * es cambiar este archivo, no arrastrar una dependencia por todo el proyecto.
 *
 * Tres reglas que no se negocian aquí:
 *
 *   1. El bucket es PRIVADO. Nada de lo que se guarde es accesible por URL
 *      directa, ni siquiera conociéndola.
 *   2. Lo que se guarda en la base es la CLAVE, no una URL. Una URL guardada
 *      caduca o deja de apuntar a nada el día que se cambie de proveedor; la
 *      clave sigue siendo válida.
 *   3. Para ver un documento se pide una URL firmada que dura un minuto. Quien
 *      la pide pasa por `authenticate` y queda en la auditoría.
 */

/** Lo único que se acepta. Un documento es un PDF o una foto, nada más. */
export const TIPOS_ACEPTADOS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** 10 MB. Una foto de una tarjeta desde un celular no llega ni de lejos. */
export const TAMANO_MAXIMO = 10 * 1024 * 1024

/**
 * Carpetas permitidas. Es una lista cerrada y no texto libre porque la carpeta
 * viaja en la petición: sin esto, `../../` en ese campo escribe donde quiera.
 */
export const CARPETAS = ['tarjetas', 'consentimientos', 'documentos']

export function hayAlmacenamientoConfigurado() {
  return Boolean(env.supabase.url && env.supabase.serviceKey)
}

function exigirConfiguracion() {
  if (!hayAlmacenamientoConfigurado()) {
    throw new DomainError(
      'ALMACENAMIENTO_SIN_CONFIGURAR',
      'El almacenamiento de documentos no está configurado. Avisa a la administración.',
    )
  }
}

function cabeceras(extra = {}) {
  return {
    Authorization: `Bearer ${env.supabase.serviceKey}`,
    apikey: env.supabase.serviceKey,
    ...extra,
  }
}

/**
 * Guarda un documento y devuelve su clave.
 *
 * El nombre lo pone el sistema, no la persona: un nombre de archivo que llega
 * de fuera trae acentos, espacios, y a veces el nombre completo de alguien.
 * La extensión sale del tipo declarado, que ya está validado contra la lista.
 */
export async function guardarDocumento({ carpeta, tipo, bytes }) {
  exigirConfiguracion()

  if (!CARPETAS.includes(carpeta)) {
    throw new DomainError('CARPETA_INVALIDA', 'Esa carpeta de documentos no existe')
  }

  const extension = TIPOS_ACEPTADOS[tipo]
  if (!extension) {
    throw new DomainError(
      'TIPO_NO_ACEPTADO',
      'Solo se aceptan archivos PDF o imágenes (JPG, PNG, WEBP)',
    )
  }

  if (!bytes?.length) {
    throw new DomainError('ARCHIVO_VACIO', 'No llegó ningún archivo')
  }

  if (bytes.length > TAMANO_MAXIMO) {
    throw new DomainError(
      'ARCHIVO_DEMASIADO_GRANDE',
      `El archivo pasa de ${Math.round(TAMANO_MAXIMO / 1024 / 1024)} MB`,
    )
  }

  const clave = `${carpeta}/${randomUUID()}.${extension}`

  const respuesta = await fetch(
    `${env.supabase.url}/storage/v1/object/${env.supabase.bucket}/${clave}`,
    {
      method: 'POST',
      headers: cabeceras({ 'Content-Type': tipo, 'x-upsert': 'false' }),
      body: bytes,
    },
  )

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '')
    throw new Error(`Supabase rechazó la subida (${respuesta.status}): ${detalle.slice(0, 200)}`)
  }

  return { clave, extension, tamano: bytes.length }
}

/**
 * URL para ver un documento, válida un minuto.
 *
 * Se pide una nueva cada vez que alguien abre el documento en vez de guardar
 * una larga: así, si alguien reenvía el enlace, lo que reenvía ya no sirve.
 */
export async function urlFirmada(clave, segundos = env.supabase.firmaSegundos) {
  exigirConfiguracion()

  if (!clave) throw new DomainError('NO_ENCONTRADO', 'Ese documento no existe')

  const respuesta = await fetch(
    `${env.supabase.url}/storage/v1/object/sign/${env.supabase.bucket}/${clave}`,
    {
      method: 'POST',
      headers: cabeceras({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: segundos }),
    },
  )

  if (respuesta.status === 404) {
    throw new DomainError('NO_ENCONTRADO', 'Ese documento ya no está')
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '')
    throw new Error(`Supabase no firmó la URL (${respuesta.status}): ${detalle.slice(0, 200)}`)
  }

  const { signedURL, signedUrl } = await respuesta.json()
  const ruta = signedUrl ?? signedURL
  if (!ruta) throw new Error('Supabase devolvió una firma vacía')

  return {
    url: `${env.supabase.url}/storage/v1${ruta.startsWith('/') ? ruta : `/${ruta}`}`,
    caducaEn: segundos,
  }
}

export async function borrarDocumento(clave) {
  exigirConfiguracion()
  if (!clave) return false

  const respuesta = await fetch(
    `${env.supabase.url}/storage/v1/object/${env.supabase.bucket}/${clave}`,
    { method: 'DELETE', headers: cabeceras() },
  )

  return respuesta.ok
}

/**
 * ¿Esto es una clave de Supabase o una ruta vieja de `public/uploads`?
 *
 * Los registros anteriores a esta migración guardan `/uploads/tarjetas/x.jpeg`.
 * Distinguirlos permite que el portal siga mostrando los que ya existían sin
 * tener que migrar archivos que, en Vercel, probablemente ya no estén.
 */
export function esClaveDeAlmacenamiento(valor) {
  if (!valor || typeof valor !== 'string') return false
  if (valor.startsWith('/') || valor.startsWith('http')) return false
  return CARPETAS.some((c) => valor.startsWith(`${c}/`))
}
