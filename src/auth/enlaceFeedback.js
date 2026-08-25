import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

const TIPO = 'feedback'
const TTL_MS = 60 * 24 * 3600 * 1000 // 60 días

export function crearEnlaceFeedback(patientId) {
  return crearCompacto(CODIGO.feedback, patientId, Date.now() + TTL_MS)
}

export function leerEnlaceFeedback(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const compacto = leerCompacto(token, CODIGO.feedback)
  if (compacto) return { tipo: TIPO, paciente: compacto.uuid, vence: compacto.vence }

  return null
}
