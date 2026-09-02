import { prisma } from '../config/database.js'
import { deLocalAUtc, diaDeLaSemana, diasEntre, minutosDelDia, partesLocales, FRANJAS } from './timezone.service.js'
import { DomainError } from '../errors/DomainError.js'
import { VIVOS } from './assignmentState.service.js'
import { SettingsService } from './settings.service.js'

/**
 * SERVICIO: agenda.
 *
 * Los huecos libres se calculan, no se guardan. Materializar una fila por cada
 * franja de 30 minutos de cada profesional serían cientos de miles de filas que
 * hay que mantener sincronizadas; calcularlas sobre un rango acotado es
 * instantáneo y nunca se desincroniza.
 */

/** Duración mínima de una sesión, en minutos. La base también la exige. */
export const DURACION_MINIMA = 45

/** Descanso obligatorio después de cada sesión. */
export const DESCANSO = 30

/** Cada cuántos minutos se ofrece un inicio posible. */
export const GRANULARIDAD = 15

/**
 * Con cuánta antelación mínima puede reservarse una sesión.
 *
 * Entre que alguien elige su hora y esa hora llega, hay trabajo que hacer y
 * gente que avisar: al profesional le tiene que llegar la confirmación con el
 * día y el enlace de la videollamada, la persona tiene que firmar el
 * consentimiento, y coordinación tiene que poder mirar que todo esté en orden.
 *
 * Sin este plazo se podía reservar una sesión que empezaba en diez minutos. La
 * cita quedaba puesta y nadie llegaba a nada: el profesional se enteraba —si se
 * enteraba— con la sesión ya empezada, y quien había pedido ayuda se quedaba
 * sola en una sala.
 *
 * Tres horas es el equilibrio: suficiente para avisar y preparar, poco para no
 * empujar a mañana a quien está mal hoy. Se puede mover sin desplegar.
 */
export const ANTELACION_MINIMA_HORAS = Number(process.env.ANTELACION_MINIMA_HORAS ?? 3)

/**
 * Los tres números de la agenda, tal y como están hoy en Parametrización.
 *
 * Estaban en constantes del código y en variables de entorno: cambiar cuánto
 * dura una sesión o cuánta antelación se exige obligaba a un despliegue.
 * Parametrización ya enseñaba dos de ellos —duración y descanso— sin que
 * nadie los leyera: perillas pintadas, que es peor que no tenerlas.
 *
 * Los valores del código se quedan de red por si la base no contesta.
 */
export async function parametrosDeAgenda() {
  const [duracionMinima, descanso, antelacionHoras] = await Promise.all([
    SettingsService.getNumero('DURACION_CITA_MINUTOS', DURACION_MINIMA),
    SettingsService.getNumero('DESCANSO_CITA_MINUTOS', DESCANSO),
    SettingsService.getNumero('ANTELACION_MINIMA_HORAS', ANTELACION_MINIMA_HORAS),
  ])
  return { duracionMinima, descanso, antelacionHoras }
}

/** No se calculan huecos más allá de este horizonte. */
export const MAX_DIAS = 56

const VIVAS = ['PROGRAMADA', 'CONFIRMADA']

function seSolapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA
}

/**
 * De lo que la persona PREFIERE a lo que la agenda ENTIENDE.
 *
 * Hay dos enums con la misma palabra. La persona elige entre PRESENCIAL,
 * VIRTUAL e INDIFERENTE; la agenda del profesional —y la cita— solo conocen
 * PRESENCIAL, VIRTUAL y AMBAS. Se parecen tanto que durante meses se pasó uno
 * donde iba el otro, y funcionó… hasta que alguien marcó «indiferente». Prisma
 * rechazó el valor y la persona vio «Error interno del servidor» en el enlace
 * que le mandamos para elegir su hora. Dos personas reales, hoy.
 *
 * INDIFERENTE no es una modalidad: es la ausencia de restricción. Para buscar
 * huecos significa «cualquiera»; para crear la sesión significa «la que
 * ofrezca el profesional», y si ofrece las dos, virtual, que es como trabaja
 * la red por defecto y no obliga a nadie a desplazarse sin haberlo pedido.
 *
 * La traducción vive aquí y solo aquí. El controlador la pasaba a mano en tres
 * sitios, cada uno con su propio `|| 'VIRTUAL'` o `?? null`, y ninguno
 * contemplaba el tercer valor.
 */
const MODALIDADES_DE_AGENDA = new Set(['PRESENCIAL', 'VIRTUAL'])

/** Para filtrar huecos. `undefined` = sin filtro, valen todos. */
export function modalidadDeAgenda(preferencia) {
  return MODALIDADES_DE_AGENDA.has(preferencia) ? preferencia : undefined
}

/** Para la sesión que se crea: siempre una concreta, nunca AMBAS ni INDIFERENTE. */
export function modalidadDeSesion(preferencia, modalidadProfesional) {
  if (MODALIDADES_DE_AGENDA.has(preferencia)) return preferencia
  if (MODALIDADES_DE_AGENDA.has(modalidadProfesional)) return modalidadProfesional
  return 'VIRTUAL'
}

/**
 * Huecos en los que este profesional podría atender.
 *
 * Un hueco es válido si la SESIÓN cabe dentro de una franja declarada, y si ni
 * la sesión ni su descanso chocan con otra cita. El descanso puede salirse de
 * la franja: es tiempo de descanso, no de atención.
 */
export async function huecosDisponibles({
  professionalId,
  desde,
  hasta,
  duracionMinutos = DURACION_MINIMA,
  descansoMinutos = DESCANSO,
  modalidad,
  /**
   * Horas de margen antes del primer hueco que se ofrece.
   *
   * Cero por defecto a propósito: quien agenda a mano desde el portal a veces
   * está al teléfono con las dos partes y necesita poder cuadrar algo para
   * dentro de un rato. El margen lo pide la pantalla de la persona, que es
   * donde nadie está mirando para avisar a nadie.
   */
  antelacionHoras = 0,
}) {
  if (duracionMinutos < DURACION_MINIMA) {
    throw new DomainError(
      'DURACION_INSUFICIENTE',
      `Una sesión dura al menos ${DURACION_MINIMA} minutos`,
    )
  }
  if (hasta <= desde) {
    throw new DomainError('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial')
  }

  const dias = diasEntre(desde, hasta)
  if (dias.length > MAX_DIAS) {
    throw new DomainError(
      'RANGO_DEMASIADO_LARGO',
      `El rango no puede superar ${MAX_DIAS} días`,
    )
  }

  const profesional = await prisma.professional.findFirst({
    where: { id: professionalId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!profesional || profesional.status !== 'ACTIVO') {
    return []
  }

  const [reglas, excepciones, citas] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: {
        professionalId,
        active: true,
        ...(modalidad && modalidad !== 'AMBAS'
          ? { modality: { in: [modalidad, 'AMBAS'] } }
          : {}),
      },
    }),
    prisma.availabilityException.findMany({
      where: { professionalId, endsAt: { gt: desde }, startsAt: { lt: hasta } },
    }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: VIVAS },
        // Se traen también las que empiezan antes del rango: su descanso puede
        // invadirlo.
        blocksUntil: { gt: desde },
        startsAt: { lt: hasta },
      },
      select: { startsAt: true, blocksUntil: true, endsAt: true },
    }),
  ])

  if (reglas.length === 0) return []

  const ahora = new Date()
  const huecos = []

  for (const dia of dias) {
    const nombreDia = diaDeLaSemana(deLocalAUtc(dia.year, dia.month, dia.day, 12 * 60))
    const delDia = reglas.filter((r) => r.weekday === nombreDia)

    for (const regla of delDia) {
      let minuto = regla.startMinute

      while (minuto + duracionMinutos <= regla.endMinute) {
        const inicio = deLocalAUtc(dia.year, dia.month, dia.day, minuto)
        const fin = new Date(inicio.getTime() + duracionMinutos * 60000)
        const bloqueoHasta = new Date(fin.getTime() + descansoMinutos * 60000)

        const enRango = inicio >= desde && fin <= hasta
        // No basta con que sea futuro: tiene que haber margen para avisar.
        const conMargen = inicio.getTime() > ahora.getTime() + antelacionHoras * 3600000

        const chocaConBloqueo = excepciones.some((e) =>
          seSolapan(inicio, fin, e.startsAt, e.endsAt),
        )

        const chocaConCita = citas.some((c) =>
          seSolapan(inicio, bloqueoHasta, c.startsAt, c.blocksUntil ?? c.endsAt),
        )

        if (enRango && conMargen && !chocaConBloqueo && !chocaConCita) {
          huecos.push({
            inicio,
            fin,
            modalidad: regla.modality,
            duracionMinutos,
          })
        }

        minuto += GRANULARIDAD
      }
    }
  }

  huecos.sort((a, b) => a.inicio - b.inicio)
  return huecos
}

/**
 * ¿Cae este horario dentro de una franja declarada por el profesional?
 * La restricción de exclusión impide los choques, pero no sabe nada de las
 * franjas: eso se comprueba aquí.
 */
export async function dentroDeDisponibilidad({ professionalId, inicio, fin }) {
  const p = partesLocales(inicio)
  const nombreDia = diaDeLaSemana(inicio)

  const reglas = await prisma.availabilityRule.findMany({
    where: { professionalId, active: true, weekday: nombreDia },
  })

  const cabe = reglas.some((regla) => {
    const desdeRegla = deLocalAUtc(p.year, p.month, p.day, regla.startMinute)
    const hastaRegla = deLocalAUtc(p.year, p.month, p.day, regla.endMinute)
    return inicio >= desdeRegla && fin <= hastaRegla
  })

  if (!cabe) {
    const excepcion = await prisma.availabilityException.findFirst({
      where: { professionalId, startsAt: { lt: fin }, endsAt: { gt: inicio } },
    })
    return { cabe: false, motivo: excepcion ? 'BLOQUEO' : 'FUERA_DE_FRANJA' }
  }

  const excepcion = await prisma.availabilityException.findFirst({
    where: { professionalId, startsAt: { lt: fin }, endsAt: { gt: inicio } },
  })

  return excepcion ? { cabe: false, motivo: 'BLOQUEO' } : { cabe: true }
}

/**
 * ¿Cae este horario dentro de lo que el profesional ofreció PARA ESTE CASO?
 *
 * Es la otra fuente de disponibilidad, y la más fresca: los días y franjas
 * que él mismo dejó en su enlace al aceptar. Si dijo «miércoles en la noche»
 * y la cita es el miércoles a las 7, frenar con «fuera de franja» es pedirle
 * permiso a quien coordina para hacer lo que el profesional ya autorizó por
 * escrito. Su agenda de perfil puede estar vieja; esta respuesta no.
 *
 * Si solo dio días, cualquier hora de esos días cuenta; si solo dio franjas,
 * cualquier día en esas franjas. Si no dio nada, no ofreció nada.
 */
export function dentroDeLoOfrecido({ dias = [], franjas = [], inicio, fin }) {
  if (dias.length === 0 && franjas.length === 0) return false

  const diaOk = dias.length === 0 || dias.includes(diaDeLaSemana(inicio))
  const franjaOk =
    franjas.length === 0 ||
    franjas.some((f) => {
      const rango = FRANJAS[f]
      return rango && minutosDelDia(inicio) >= rango.desde && minutosDelDia(fin) <= rango.hasta
    })

  return diaOk && franjaOk
}

const DIA_LARGO = {
  LUNES: 'lunes', MARTES: 'martes', MIERCOLES: 'miércoles', JUEVES: 'jueves',
  VIERNES: 'viernes', SABADO: 'sábados', DOMINGO: 'domingos',
}

/** 870 → "2:30 p. m.". Los minutos de las reglas son hora local de Bogotá. */
function horaLegible(minutos) {
  const h24 = Math.floor(minutos / 60)
  const m = minutos % 60
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`
}

/**
 * Las franjas declaradas de un profesional, en palabras: "lunes de 8:00 a. m.
 * a 12:00 p. m., miércoles de 2:00 p. m. a 6:00 p. m.".
 *
 * Existe para los mensajes de error: decirle a quien coordina "está fuera de
 * las franjas" sin decirle cuáles son las franjas la obliga a irse a otra
 * pantalla a averiguar lo que el sistema ya sabía.
 */
export async function franjasEnPalabras(professionalId) {
  const reglas = await prisma.availabilityRule.findMany({
    where: { professionalId, active: true },
  })
  return describirFranjas(reglas)
}

/** La parte pura, para poder probarla sin base de datos. */
export function describirFranjas(reglas) {
  if (!reglas?.length) return null

  // En el orden de la semana, no en el del enum de la base.
  const ORDEN = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
  return reglas
    .slice()
    .sort((a, b) => ORDEN.indexOf(a.weekday) - ORDEN.indexOf(b.weekday) || a.startMinute - b.startMinute)
    .map((r) => `${DIA_LARGO[r.weekday] ?? r.weekday} de ${horaLegible(r.startMinute)} a ${horaLegible(r.endMinute)}`)
    .join(', ')
}

const FRANJA_LARGA = { MANANA: 'en la mañana', TARDE: 'en la tarde', NOCHE: 'en la noche' }

/** «miércoles y jueves en la noche» — lo ofrecido para el caso, en palabras. */
export function ofertaEnPalabras(dias = [], franjas = []) {
  if (dias.length === 0 && franjas.length === 0) return null
  const d = dias.map((x) => DIA_LARGO[x] ?? x.toLowerCase()).join(' y ')
  const f = franjas.map((x) => FRANJA_LARGA[x] ?? x.toLowerCase()).join(' y ')
  return [d, f].filter(Boolean).join(' ')
}

/** Cuántos casos activos lleva cada profesional. Se calcula, no se guarda. */
export async function cargaActual(professionalIds) {
  const filas = await prisma.caseAssignment.groupBy({
    by: ['professionalId'],
    where: {
      professionalId: { in: professionalIds },
      // Cuenta tambien las propuestas sin responder: una propuesta ocupa a
      // quien la recibe, aunque todavia no haya dicho que si.
      status: { in: VIVOS },
      deletedAt: null,
    },
    _count: { _all: true },
  })

  const mapa = new Map(filas.map((f) => [f.professionalId, f._count._all]))
  return (id) => mapa.get(id) ?? 0
}

/**
 * Deja solo los huecos que de verdad son opciones distintas.
 *
 * Una sesión dura 45 minutos y bloquea 75 con su descanso, pero los inicios se
 * generan cada 15. El resultado es que por cada hueco REAL se ofrecen cinco
 * botones que se excluyen entre sí: si alguien elige las 6:00, el siguiente
 * inicio posible es 7:15, así que 6:15, 6:30, 6:45 y 7:00 no eran opciones —
 * eran la misma franja movida un cuarto de hora.
 *
 * A la persona que está eligiendo su primera sesión eso no le da más libertad,
 * le da una pantalla de ochenta botones donde había doce decisiones. Y a la
 * profesional le fragmenta el día: quien reserva a las 6:15 deja muerto el
 * cuarto de hora anterior.
 *
 * La granularidad fina se conserva en la generación a propósito. Es la que
 * permite ofrecer un hueco que empieza justo después de una cita ya puesta, en
 * vez de saltar al siguiente múltiplo de 75 y perder la tarde entera. Aquí solo
 * se recorre lo ya encontrado y se va quedando el primero de cada bloque.
 */
export function sinSolaparse(huecos, descansoMinutos = DESCANSO) {
  const elegidos = []
  let libreDesde = -Infinity

  // Vienen ordenados por inicio; si no, se ordena para no depender de eso.
  for (const hueco of [...huecos].sort((a, b) => a.inicio - b.inicio)) {
    if (hueco.inicio.getTime() < libreDesde) continue

    elegidos.push(hueco)
    libreDesde = hueco.fin.getTime() + descansoMinutos * 60000
  }

  return elegidos
}
