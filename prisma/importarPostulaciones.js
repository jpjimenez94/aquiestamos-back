#!/usr/bin/env node
/**
 * Carga única de las postulaciones que llegaron por el Google Form, antes de
 * que existiera el formulario del sitio.
 *
 *   npm run db:importar            muestra qué haría, sin tocar nada
 *   npm run db:importar -- --si    lo inserta
 *
 * Contra producción se ejecuta desde la máquina de quien hace la carga,
 * apuntando DATABASE_URL a Railway:
 *   DATABASE_URL="postgresql://...railway..." npm run db:importar -- --si
 *
 * Los datos vienen de `prisma/datos/postulaciones-google.json`, generado una
 * vez desde el Excel de respuestas. Ese archivo NO está en el repositorio y no
 * debe estarlo: son nombres, celulares y correos de 71 personas, y el
 * repositorio es público. Vive en la máquina de quien hace la carga.
 *
 * Es idempotente: la clave es el correo. Volver a ejecutarlo no duplica a
 * nadie, y no pisa a quien ya se haya registrado por el formulario nuevo.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const aqui = dirname(fileURLToPath(import.meta.url))
const EN_SERIO = process.argv.includes('--si')

// ---------------------------------------------------------------------------
// Decisiones de mapeo. Todas acordadas con la ONG antes de escribir esto.
// ---------------------------------------------------------------------------

/**
 * Estas personas SÍ dieron su autorización: la del Google Form, más la que
 * dieron por otros medios. Se marca con una versión propia para que quede
 * registrado que aceptaron ese texto y no el del sitio nuevo.
 */
const VERSION_CONSENTIMIENTO = '2026-08-google'

/**
 * El formulario viejo nunca preguntó los años de experiencia. Se importan
 * todos con el tramo más bajo; el equipo lo corrige al revisar cada ficha.
 */
const EXPERIENCIA_POR_DEFECTO = 'MENOS_DE_1'

/**
 * Tampoco preguntaba QUÉ DÍAS ni EN QUÉ FRANJA, que es justo lo que necesita la
 * agenda. Se pone un marcador de posición para que la ficha no quede huérfana.
 *
 * OJO: esta disponibilidad NO la declaró nadie. Antes de agendarle a una de
 * estas personas hay que confirmársela, o pedirle que la cargue ella misma
 * desde el portal.
 */
const DIAS_POR_DEFECTO = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES']
const FRANJA_POR_DEFECTO = ['TARDE']

/** Las nueve del catálogo. Cualquier otra cosa se guarda como texto libre. */
const POBLACIONES = new Set([
  'Niños y niñas',
  'Adolescentes',
  'Jóvenes',
  'Adultos',
  'Personas mayores',
  'Familias',
  'Enfoque de género',
  'Población víctima de violencia',
  'Población desplazada/migrante',
])

const EXPERIENCIA_CRISIS = {
  'Sí': 'SI',
  'No': 'NO',
  'Tengo formación, pero poca experiencia práctica': 'FORMACION_POCA_PRACTICA',
  'No tengo formación pero estoy disponible para aprender': 'SIN_FORMACION_DISPONIBLE_APRENDER',
}

const MODALIDAD = { Presencial: 'PRESENCIAL', Virtual: 'VIRTUAL', Ambas: 'AMBAS' }

const TARJETA = { 'Sí': 'SI', 'En trámite': 'EN_TRAMITE', 'Soy estudiante': 'ESTUDIANTE' }

const VACUNA = { 'Sí': 'SI', No: 'NO', 'Ya tengo cita para aplicármela': 'CITA_AGENDADA' }

const HORAS = {
  'Entre 1 y 3 horas semanales': 'ENTRE_1_Y_3',
  'Entre 4 y 6 horas semanales': 'ENTRE_4_Y_6',
  'Más de 6 horas semanales': 'MAS_DE_6',
  'Disponibilidad variable': 'VARIABLE',
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

function partir(texto) {
  return String(texto || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Deja el celular en diez dígitos cuando se puede; si no, lo devuelve limpio. */
function normalizarCelular(crudo) {
  const digitos = String(crudo || '').replace(/\D/g, '')
  // Varias personas escribieron el indicativo de país.
  const sinIndicativo = digitos.startsWith('57') && digitos.length === 12 ? digitos.slice(2) : digitos
  return sinIndicativo
}

/**
 * Se prefiere el correo que la persona escribió a mano sobre el de su cuenta de
 * Google: es el que eligió dar para que la contacten. Seis registros difieren.
 */
function elegirCorreo(registro) {
  const escrito = (registro.correoEscrito || '').trim().toLowerCase()
  const google = (registro.correoCuentaGoogle || '').trim().toLowerCase()
  return { correo: escrito || google, alterno: escrito && google && escrito !== google ? google : null }
}

/**
 * "Disponibilidad aproximada" era de selección múltiple, pero `weeklyHours`
 * admite un solo valor. Quien marcó varias opciones se guarda como VARIABLE,
 * que es literalmente lo que quiso decir.
 */
function horasSemanales(crudo) {
  const partes = partir(crudo).map((p) => HORAS[p]).filter(Boolean)
  if (partes.length === 0) return null
  if (partes.length > 1) return 'VARIABLE'
  return partes[0]
}

/** Límites reales de las columnas, para no chocar con la base. */
const LARGO = { fullName: 160, phone: 40, email: 160, city: 160, profession: 160, additionalTraining: 400, availableToTravel: 200, populationOther: 200 }

/** Recorta al límite de la columna y deja constancia de lo que se cortó. */
function recortar(texto, campo, avisos) {
  const valor = String(texto || '')
  const max = LARGO[campo]
  if (valor.length <= max) return valor
  avisos.push(`"${campo}" tenía ${valor.length} caracteres y se recortó a ${max}`)
  return valor.slice(0, max - 1) + '…'
}

/**
 * "Tengo formación en" recibió de todo: desde "Psicología" hasta un párrafo de
 * 538 caracteres. Lo corto va a `profession`, que es lo que se filtra; lo largo
 * es en realidad formación, y va al campo que tiene sitio para ello.
 */
function repartirFormacion(texto, avisos) {
  const valor = String(texto || '').trim()
  if (!valor) return { profession: '', additionalTraining: null }
  if (valor.length <= LARGO.profession) return { profession: valor, additionalTraining: null }
  return { profession: '', additionalTraining: recortar(valor, 'additionalTraining', avisos) }
}

function mapear(registro) {
  const { correo, alterno } = elegirCorreo(registro)
  const partes = partir(registro.poblaciones)
  const delCatalogo = partes.filter((p) => POBLACIONES.has(p))
  const fuera = partes.filter((p) => !POBLACIONES.has(p))

  const avisos = []
  if (alterno) avisos.push(`otro correo en su cuenta de Google: ${alterno}`)
  if (fuera.length) avisos.push(`población fuera del catálogo: ${fuera.join(' / ')}`)
  if (delCatalogo.length === 0) avisos.push('sin ninguna población del catálogo')

  const celular = normalizarCelular(registro.celular)
  if (!/^3\d{9}$/.test(celular)) avisos.push(`celular con formato raro: ${registro.celular}`)

  const formacion = repartirFormacion(registro.formacion, avisos)

  return {
    avisos,
    datos: {
      fullName: recortar(registro.nombre, 'fullName', avisos),
      phone: recortar(celular, 'phone', avisos),
      email: recortar(correo, 'email', avisos),
      // La ciudad se guarda tal como la escribieron, con todas sus variantes.
      city: recortar(registro.residencia, 'city', avisos),
      // Solo 16 de 71 contestaron esta pregunta; el resto queda vacío.
      profession: formacion.profession,
      additionalTraining: formacion.additionalTraining,
      yearsExperience: EXPERIENCIA_POR_DEFECTO,
      professionalCard: TARJETA[registro.tarjetaProfesional] ?? 'ESTUDIANTE',
      populations: delCatalogo,
      populationOther: fuera.length ? recortar(fuera.join(', '), 'populationOther', avisos) : null,
      crisisExperience: EXPERIENCIA_CRISIS[registro.experienciaCrisis] ?? 'NO',
      modality: MODALIDAD[registro.modalidad] ?? 'VIRTUAL',
      availableToTravel: registro.desplazarseA
        ? recortar(registro.desplazarseA, 'availableToTravel', avisos)
        : null,
      availableDays: DIAS_POR_DEFECTO,
      availableSlots: FRANJA_POR_DEFECTO,
      weeklyHours: horasSemanales(registro.disponibilidad),
      yellowFeverVaccine: VACUNA[registro.vacunaFiebreAmarilla] ?? null,
      consentVersion: VERSION_CONSENTIMIENTO,
      dataConsent: registro.autorizacion === 'Sí',
      sensitiveDataConsent: false,
      communicationsConsent: false,
      status: 'NUEVO',
      // Se conserva la fecha real de la postulación, no la de la importación:
      // la bandeja ordena por antigüedad y si no, todas parecerían de hoy.
      createdAt: new Date(registro.recibidaEn),
    },
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const archivo = join(aqui, 'datos', 'postulaciones-google.json')

  let crudo
  try {
    crudo = readFileSync(archivo, 'utf8')
  } catch {
    console.error('')
    console.error('No encuentro el archivo con las postulaciones:')
    console.error(`  ${archivo}`)
    console.error('')
    console.error('No está en el repositorio a propósito: lleva nombres, celulares y')
    console.error('correos reales, y el repositorio es público. Pídeselo a quien hizo')
    console.error('la carga o vuelve a generarlo desde el Excel de respuestas.')
    console.error('')
    process.exit(1)
  }

  const { registros, formulario } = JSON.parse(crudo)

  console.log('')
  console.log(`Importación de postulaciones · ${formulario}`)
  console.log(`${registros.length} registros en el archivo`)
  console.log(EN_SERIO ? 'MODO REAL: se van a insertar.' : 'Simulación. Añade --si para insertarlas.')
  console.log('')

  const porCorreo = new Map()
  const sinCorreo = []
  const avisos = []

  for (const registro of registros) {
    const { datos, avisos: propios } = mapear(registro)

    if (!datos.email) {
      sinCorreo.push(registro.nombre || `fila ${registro.filaExcel}`)
      continue
    }
    if (!datos.fullName) {
      sinCorreo.push(`fila ${registro.filaExcel} (sin nombre)`)
      continue
    }
    // El archivo no trae correos repetidos, pero por si acaso: gana el último.
    porCorreo.set(datos.email, datos)
    for (const aviso of propios) {
      avisos.push(`  ${datos.fullName} — ${aviso}`)
    }
  }

  const existentes = await prisma.volunteer.findMany({
    where: { email: { in: [...porCorreo.keys()] } },
    select: { email: true, consentVersion: true },
  })
  const yaEstan = new Map(existentes.map((v) => [v.email, v]))

  const nuevas = [...porCorreo.values()].filter((d) => !yaEstan.has(d.email))
  const repetidas = [...porCorreo.values()].filter((d) => yaEstan.has(d.email))

  console.log(`  ${nuevas.length} se insertarían`)
  console.log(`  ${repetidas.length} ya están en la base (se omiten)`)
  if (sinCorreo.length) {
    console.log(`  ${sinCorreo.length} se omiten por falta de correo o nombre:`)
    for (const q of sinCorreo) console.log(`      ${q}`)
  }

  if (avisos.length) {
    console.log('')
    console.log('Cosas para revisar después, desde el portal:')
    for (const aviso of avisos) console.log(aviso)
  }

  console.log('')
  console.log('Lo que NO traía el formulario viejo y queda por confirmar:')
  console.log(`  · años de experiencia  -> todos como "${EXPERIENCIA_POR_DEFECTO}"`)
  console.log(`  · días y franja        -> ${DIAS_POR_DEFECTO.length} días, ${FRANJA_POR_DEFECTO.join(', ')}`)
  console.log('    Esa disponibilidad NO la declaró nadie. Confírmala antes de agendarle a alguien.')
  const sinProfesion = nuevas.filter((d) => !d.profession).length
  console.log(`  · profesión            -> ${sinProfesion} de ${nuevas.length} quedan vacías`)

  if (!EN_SERIO) {
    console.log('')
    console.log('No se insertó nada. Añade --si cuando quieras ejecutarlo.')
    return
  }

  if (nuevas.length === 0) {
    console.log('')
    console.log('No hay nada nuevo que insertar.')
    return
  }

  const resultado = await prisma.volunteer.createMany({ data: nuevas, skipDuplicates: true })

  console.log('')
  console.log(`Listo. ${resultado.count} postulaciones insertadas.`)
  console.log('Aparecen en el portal, en Postulaciones, como pendientes de revisar.')
}

main()
  .catch((error) => {
    console.error('[importar] Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
