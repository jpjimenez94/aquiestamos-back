import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { DomainError } from '../errors/DomainError.js'
import { huecosDisponibles, cargaActual } from './scheduling.service.js'
import { franjaDe, diaDeLaSemana } from './timezone.service.js'

/**
 * SERVICIO: emparejamiento.
 *
 * Responde a «¿quién puede atender a esta persona?» en una sola consulta.
 * Es la pantalla que decide si el portal se usa o el equipo vuelve a la hoja
 * de cálculo, así que devuelve ya ordenado y con el primer hueco concreto.
 */

const DIAS_A_MIRAR = 14

const PESO_EXPERIENCIA = {
  MAS_DE_5: 4,
  ENTRE_3_Y_5: 3,
  ENTRE_1_Y_3: 2,
  MENOS_DE_1: 1,
}

const ETIQUETAS_EXP = {
  MAS_DE_5: '+5 años de experiencia',
  ENTRE_3_Y_5: '3 a 5 años de experiencia',
  ENTRE_1_Y_3: '1 a 3 años de experiencia',
  MENOS_DE_1: '< 1 año de experiencia',
}

function normalizar(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
}

function esMismaCiudad(ciudadA, ciudadB) {
  const normA = normalizar(ciudadA)
  const normB = normalizar(ciudadB)
  if (!normA || !normB) return false
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return true

  const palabrasA = normA.split(/\s+/).filter((w) => w.length > 3 && !['valle', 'norte', 'santander', 'cundinamarca', 'antioquia'].includes(w))
  const palabrasB = normB.split(/\s+/).filter((w) => w.length > 3 && !['valle', 'norte', 'santander', 'cundinamarca', 'antioquia'].includes(w))
  return palabrasA.some((p) => normB.includes(p)) || palabrasB.some((p) => normA.includes(p))
}

/**
 * Puntúa qué tan bien encaja un profesional con una persona.
 * Prioriza fuertemente la coincidencia geográfica (si es presencial),
 * la tarjeta profesional verificada, los años de experiencia y la disponibilidad.
 */
function puntuar({ profesional, paciente, carga, coincidenciaHorario, tieneHueco }) {
  let puntos = 0
  const razones = []

  // 1. Verificación Legal de Tarjeta Profesional
  if (profesional.professionalCardVerified) {
    puntos += 35
    razones.push('Tarjeta Profesional / Soporte Verificado')
  }

  // 2. Coincidencia geográfica para atención presencial
  const mismaCiudad = esMismaCiudad(paciente.city, profesional.city)
  const seDesplaza = profesional.travelsTo && esMismaCiudad(paciente.city, profesional.travelsTo)

  if (paciente.preferredModality === 'PRESENCIAL') {
    if (mismaCiudad) {
      puntos += 50
      razones.push(`Atención presencial en ${profesional.city}`)
    } else if (seDesplaza) {
      puntos += 30
      razones.push(`Se desplaza a ${paciente.city}`)
    }
  } else if (paciente.preferredModality === 'VIRTUAL') {
    puntos += 15
    razones.push('Disponible para atención virtual')
  }

  // 3. Puntos por años de experiencia clínica
  const pesoExp = PESO_EXPERIENCIA[profesional.yearsExperience] ?? 0
  if (pesoExp > 0) {
    puntos += pesoExp * 15 // +60 por +5 años, +45 por 3-5 años, +30 por 1-3 años, +15 por <1 año
    razones.push(ETIQUETAS_EXP[profesional.yearsExperience])
  }

  // 4. Disponibilidad en agenda
  if (tieneHueco) {
    puntos += 30
    razones.push('Tiene huecos de agenda libres pronto')
  }

  if (coincidenciaHorario) {
    puntos += 20
    razones.push('Coincide con los días y franjas solicitadas')
  }

  // 5. Cupo y balance de carga
  const cupo = profesional.maxActiveCases - carga
  if (cupo > 0) {
    puntos += Math.min(10, cupo * 4)
    razones.push(`Lleva ${carga} de ${profesional.maxActiveCases} casos activos`)
  }

  return { puntos, razones }
}

/**
 * Candidatos para una persona, ordenados por encaje.
 *
 * `poblaciones` permite afinar: si la solicitud es para un menor, pasar
 * `['Niños y niñas']` deja fuera a quien no tiene esa experiencia.
 */
export async function candidatosPara({ patientId, poblaciones, desde, hasta }) {
  const paciente = await PatientModel.findById(patientId)
  if (!paciente) throw new DomainError('NO_ENCONTRADO', 'La persona no existe')

  const yaAsignada = await CaseAssignmentModel.findActivaDePaciente(patientId)
  if (yaAsignada) {
    throw new DomainError(
      'YA_TIENE_PROFESIONAL',
      `Esta persona ya está con ${yaAsignada.professional.fullName}. Cierra ese caso antes de reasignar.`,
      { asignacionId: yaAsignada.id },
    )
  }

  const inicio = desde ?? new Date()
  const fin = hasta ?? new Date(inicio.getTime() + DIAS_A_MIRAR * 24 * 60 * 60 * 1000)

  const candidatos = await ProfessionalModel.findCandidatos({
    populations: poblaciones,
    modality: paciente.preferredModality,
  })

  if (candidatos.length === 0) return { paciente, candidatos: [] }

  const carga = await cargaActual(candidatos.map((c) => c.id))

  const conHuecos = await Promise.all(
    candidatos.map(async (profesional) => {
      const cargaActualDelProfesional = carga(profesional.id)
      const sinCupo = cargaActualDelProfesional >= profesional.maxActiveCases

      const huecos = await huecosDisponibles({
        professionalId: profesional.id,
        desde: inicio,
        hasta: fin,
        modalidad:
          paciente.preferredModality === 'INDIFERENTE' ? undefined : paciente.preferredModality,
      })

      // Huecos que además caen en un día y una franja que la persona pidió.
      const sinPreferencias =
        paciente.availableDays.length === 0 && paciente.availableSlots.length === 0

      const huecosQueLeSirven = sinPreferencias
        ? huecos
        : huecos.filter(
            (h) =>
              (paciente.availableDays.length === 0 ||
                paciente.availableDays.includes(diaDeLaSemana(h.inicio))) &&
              (paciente.availableSlots.length === 0 ||
                paciente.availableSlots.includes(franjaDe(h.inicio))),
          )

      const { puntos, razones } = puntuar({
        profesional,
        paciente,
        carga: cargaActualDelProfesional,
        coincidenciaHorario: huecosQueLeSirven.length > 0,
        tieneHueco: huecos.length > 0,
      })

      return {
        profesional,
        carga: cargaActualDelProfesional,
        cupo: profesional.maxActiveCases,
        sinCupo,
        huecosLibres: huecos.length,
        huecosQueLeSirven: huecosQueLeSirven.length,
        /** El primero que le sirve a la persona; si ninguno, el primero libre. */
        primerHueco: huecosQueLeSirven[0] ?? huecos[0] ?? null,
        franjaDelPrimerHueco: huecosQueLeSirven[0]
          ? franjaDe(huecosQueLeSirven[0].inicio)
          : huecos[0]
            ? franjaDe(huecos[0].inicio)
            : null,
        puntos: sinCupo ? 0 : puntos,
        razones: sinCupo ? ['Ya está en su cupo máximo'] : razones,
      }
    }),
  )

  const esPresencial = paciente.preferredModality === 'PRESENCIAL'

  // Ordenamiento inteligente del Top:
  // 1. Quien tiene cupo disponible va primero
  // 2. Si es PRESENCIAL -> profesionales en la misma ciudad o que se desplazan
  // 3. Profesionales con Tarjeta Profesional Verificada (TP) primero
  // 4. Años de experiencia clínica (+5 años primero)
  // 5. Puntos globales de coincidencia horaria
  // 6. Menor carga actual
  conHuecos.sort((a, b) => {
    if (a.sinCupo !== b.sinCupo) return a.sinCupo ? 1 : -1

    if (esPresencial && paciente.city) {
      const matchA = esMismaCiudad(paciente.city, a.profesional.city) || (a.profesional.travelsTo && esMismaCiudad(paciente.city, a.profesional.travelsTo))
      const matchB = esMismaCiudad(paciente.city, b.profesional.city) || (b.profesional.travelsTo && esMismaCiudad(paciente.city, b.profesional.travelsTo))
      if (matchA !== matchB) return matchA ? -1 : 1
    }

    const tpA = a.profesional.professionalCardVerified === true
    const tpB = b.profesional.professionalCardVerified === true
    if (tpA !== tpB) return tpA ? -1 : 1

    const expA = PESO_EXPERIENCIA[a.profesional.yearsExperience] ?? 0
    const expB = PESO_EXPERIENCIA[b.profesional.yearsExperience] ?? 0
    if (expB !== expA) return expB - expA

    if (b.puntos !== a.puntos) return b.puntos - a.puntos
    return a.carga - b.carga
  })

  return { paciente, candidatos: conHuecos }
}
