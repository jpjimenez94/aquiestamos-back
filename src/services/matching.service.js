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

/**
 * Puntúa qué tan bien encaja un profesional con una persona.
 * No es una nota académica: solo sirve para ordenar la lista.
 */
function puntuar({ profesional, paciente, carga, coincidenciaHorario, tieneHueco }) {
  let puntos = 0
  const razones = []

  if (tieneHueco) {
    puntos += 40
    razones.push('Tiene un hueco libre pronto')
  }

  if (coincidenciaHorario) {
    puntos += 25
    razones.push('Coincide con los días y franjas que pidió la persona')
  }

  if (
    paciente.city &&
    profesional.city &&
    profesional.city.toLowerCase() === paciente.city.toLowerCase()
  ) {
    puntos += 15
    razones.push('Está en la misma ciudad')
  }

  const cupo = profesional.maxActiveCases - carga
  if (cupo > 0) {
    // Se prefiere a quien está menos cargado, para repartir el trabajo.
    puntos += Math.min(15, cupo * 5)
    razones.push(`Lleva ${carga} de ${profesional.maxActiveCases} casos`)
  }

  if (profesional.yearsExperience === 'MAS_DE_5' || profesional.yearsExperience === 'ENTRE_3_Y_5') {
    puntos += 5
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
    // La ciudad no filtra: si es virtual, da igual. Solo puntúa.
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
      // Si no declaró preferencias, cualquier hueco sirve.
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

  conHuecos.sort((a, b) => b.puntos - a.puntos || a.carga - b.carga)

  return { paciente, candidatos: conHuecos }
}
