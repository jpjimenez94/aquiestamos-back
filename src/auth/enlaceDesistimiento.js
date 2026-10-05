import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

/**
 * El enlace donde alguien deja constancia de que no quiere continuar.
 *
 * Dura dos meses, como el de la encuesta y el del feedback: es una decisión,
 * no un trámite con fecha de vencimiento. Quien desiste puede tardar en
 * abrirlo —o abrirlo, pensarlo y volver una semana después— y que se le haya
 * caducado el enlace mientras lo pensaba sería una forma tonta de obligarla a
 * pedirlo otra vez.
 */
const TTL_MS = 60 * 24 * 3600 * 1000 // 60 días

export function crearEnlaceDesistimiento(patientId) {
  return crearCompacto(CODIGO.desistimiento, patientId, Date.now() + TTL_MS)
}

export function leerEnlaceDesistimiento(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const compacto = leerCompacto(token, CODIGO.desistimiento)
  return compacto ? { paciente: compacto.uuid, vence: compacto.vence } : null
}
