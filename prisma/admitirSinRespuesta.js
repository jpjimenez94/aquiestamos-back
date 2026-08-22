#!/usr/bin/env node
/**
 * Recoge a mano a quien lleva días sin responder el tamizaje.
 *
 *   npm run admision:rescatar            usa el umbral configurado
 *   npm run admision:rescatar -- --dias 5
 *
 * El servidor ya hace esto solo cada hora. Este script existe para dos cosas:
 * ver qué haría antes de que lo haga, y recogerlo todo de una después de un
 * despliegue en el que el barrido estuvo parado.
 */
import { barrer } from '../src/admision/barrido.js'
import { DIAS_SIN_RESPUESTA } from '../src/services/promotion.service.js'
import { prisma } from '../src/config/database.js'

const indice = process.argv.indexOf('--dias')
const dias = indice > -1 ? Number(process.argv[indice + 1]) : DIAS_SIN_RESPUESTA

if (!Number.isFinite(dias) || dias < 0) {
  console.error('El umbral en días tiene que ser un número positivo.')
  process.exit(1)
}

console.log(`Buscando solicitudes con ${dias} días o más sin responder el tamizaje...`)

const resumen = await barrer({ dias })

console.log(`Revisadas: ${resumen.revisadas}`)
console.log(`Admitidas: ${resumen.admitidas}`)
if (resumen.fallidas > 0) console.log(`Fallidas:  ${resumen.fallidas}`)

await prisma.$disconnect()
