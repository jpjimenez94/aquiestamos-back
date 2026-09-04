import { prisma } from '../config/database.js'
import { VIVOS } from '../services/assignmentState.service.js'

const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: CaseAssignment
 */
export const CaseAssignmentModel = {
  create(data) {
    return prisma.caseAssignment.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.caseAssignment.findFirst({
      where: { id, ...vivos },
      include: { professional: true, patient: true },
    })
  },

  /**
   * La asignación EN CURSO de un paciente: propuesta, aceptada o activa.
   *
   * Un índice único garantiza que solo haya una. Se llama "abierta" y no
   * "activa" a propósito: desde que asignar es una negociación, la mayor
   * parte del tiempo un caso está esperando respuesta, no acompañándose.
   */
  findAbiertaDePaciente(patientId) {
    if (!esUuid(patientId)) return null
    return prisma.caseAssignment.findFirst({
      where: { patientId, status: { in: VIVOS }, ...vivos },
      include: { professional: true },
    })
  },

  /**
   * Las que ya se cerraron: quién la acompañó antes, y por qué se soltó.
   *
   * La ficha solo leía la asignación viva, así que al reasignar desaparecían de
   * la pantalla el profesional anterior, la fecha y el motivo — y el paso 3 de
   * la tira pasaba a decir «no hay nada registrado» aunque sí hubo profesional.
   * El rastro quedaba en la auditoría, que nadie mira sin saber qué buscar.
   *
   * De más reciente a más antigua: lo último que pasó es lo que se pregunta.
   */
  findCerradasDePaciente(patientId) {
    if (!esUuid(patientId)) return []
    return prisma.caseAssignment.findMany({
      where: { patientId, status: { notIn: VIVOS }, ...vivos },
      include: { professional: { select: { id: true, fullName: true } } },
      orderBy: { endedAt: 'desc' },
    })
  },

  /** Solo la que ya tiene cita: acompañamiento en curso de verdad. */
  findActivaDePaciente(patientId) {
    if (!esUuid(patientId)) return null
    return prisma.caseAssignment.findFirst({
      where: { patientId, status: 'ACTIVA', ...vivos },
      include: { professional: true },
    })
  },

  findDeProfesional(professionalId, { status = 'ACTIVA' } = {}) {
    if (!esUuid(professionalId)) return []
    return prisma.caseAssignment.findMany({
      where: { professionalId, ...(status ? { status } : {}), ...vivos },
      include: { patient: true },
      orderBy: { startedAt: 'desc' },
    })
  },

  /**
   * Cuántos casos ocupan a este profesional.
   *
   * Cuenta las propuestas sin responder, no solo los acompañamientos en curso.
   * Si no, se le puede proponer el mismo profesional a diez personas a la vez
   * y todas "caben" en su cupo.
   */
  contarActivas(professionalId) {
    return prisma.caseAssignment.count({
      where: { professionalId, status: { in: VIVOS }, ...vivos },
    })
  },

  /**
   * La respuesta del profesional.
   *
   * Ya no se le piden días ni franjas. Su agenda está cargada desde que se
   * registró y es la única fuente de cuándo puede; pedírselos otra vez era
   * pedirle dos veces lo mismo, y encima en el paso donde más se moría el
   * proceso. Lo único que hace falta saber es si puede tomar este caso.
   *
   * `nota` se queda: es el matiz que no cabe en una agenda —«después de las 4
   * mejor»— y lo escribe él, no lo transcribe nadie.
   */
  responder(id, { acepta, nota = null, motivo = null }) {
    return prisma.caseAssignment.update({
      where: { id },
      data: {
        status: acepta ? 'ACEPTADA' : 'RECHAZADA',
        respondedAt: new Date(),
        availabilityNote: acepta ? nota : null,
        declineReason: acepta ? null : motivo,
        ...(acepta ? {} : { endedAt: new Date() }),
      },
    })
  },

  /**
   * Dijo «sí puedo» sobre una asignación que ya nacía aceptada.
   *
   * No es una transición —el estado no se mueve— pero sí es una señal de vida,
   * y el barrido la necesita: libera las ACEPTADA cuyo `respondedAt` pase de
   * los días de plazo, y ese campo se escribe al ASIGNAR, no al avisar. Sin
   * refrescarlo aquí, quien confirmaba el día 2 perdía el caso el día 3 igual
   * que quien no contestó nunca.
   *
   * La nota solo se pisa si trae algo: el formulario manda cadena vacía cuando
   * no se escribió nada, y eso borraría el «después de las 4 mejor» que él
   * dejó en su momento.
   */
  confirmar(id, { nota = null } = {}) {
    return prisma.caseAssignment.update({
      where: { id },
      data: {
        respondedAt: new Date(),
        ...(nota && String(nota).trim() ? { availabilityNote: nota } : {}),
      },
    })
  },

  /** La persona acompañada eligió horario: el caso arranca de verdad. */
  activar(id) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'ACTIVA', patientConfirmedAt: new Date(), startedAt: new Date() },
    })
  },

  /** Aceptó, pero no hubo forma de cuadrar. Vuelve a la cola. */
  cancelar(id, motivo) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'CANCELADA', endedAt: new Date(), closeReason: motivo ?? null },
    })
  },

  cerrar(id, motivo) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'CERRADA', endedAt: new Date(), closeReason: motivo ?? null },
    })
  },
}
