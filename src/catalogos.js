/**
 * Etiquetas legibles de los enums.
 *
 * Los enums viven en mayusculas dentro del sistema; el texto que ve una persona
 * vive aqui, en un solo sitio, para que no se escriba distinto en cada pantalla.
 */

export const ETIQUETAS_DIA = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miercoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sabado',
  DOMINGO: 'Domingo',
}

export const ETIQUETAS_FRANJA = {
  MANANA: 'Manana (8 a. m. - 12 m.)',
  TARDE: 'Tarde (12 m. - 6 p. m.)',
  NOCHE: 'Noche (6 - 9 p. m.)',
}

export const ETIQUETAS_ESTADO_PROFESIONAL = {
  PENDIENTE_VALIDACION: 'Pendiente de validacion',
  ACTIVO: 'Activo',
  PAUSADO: 'Pausado',
  INACTIVO: 'Inactivo',
}

export const ETIQUETAS_ESTADO_PACIENTE = {
  NUEVO: 'Nuevo',
  EN_ADMISION: 'En admision',
  ASIGNADO: 'Asignado',
  EN_ACOMPANAMIENTO: 'En acompanamiento',
  CERRADO: 'Cerrado',
}

export const ETIQUETAS_MODALIDAD = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  AMBAS: 'Ambas',
  INDIFERENTE: 'Indiferente',
}

/// Areas del voluntariado de otras disciplinas.
export const ETIQUETAS_AREA = {
  SALUD: 'Salud y primeros auxilios',
  SOCIAL_LEGAL_EDUCATIVO: 'Social, legal y educativo',
  OPERACION_LOGISTICA: 'Operacion y logistica',
  COMUNICACION_TECNOLOGIA: 'Comunicacion y tecnologia',
  GESTION_PROYECTOS: 'Gestion y proyectos',
  OTRA: 'Otra area',
}

/// Que reporta el profesional sobre su asignacion.
export const ETIQUETAS_RESULTADO = {
  CITA_ACORDADA: 'Quedamos en una cita',
  YA_ATENDIDA: 'Ya la acompane',
  NO_CONTESTA: 'No contesta',
  DATOS_ERRADOS: 'Los datos no corresponden',
  NO_QUIERE: 'No quiere el acompanamiento',
  SIGO_INTENTANDO: 'Sigo intentando',
  NO_ASISTIO: 'Teníamos sesión y no se presentó',
  OTRO: 'Otra cosa',
}

/// Qué sigue después de una sesión hecha. Lo dice el profesional en su reporte.
export const ETIQUETAS_QUE_SIGUE = {
  NECESITA_MAS: 'Necesita más sesiones',
  SUFICIENTE: 'Con esta fue suficiente',
  NO_SABE: 'Aún no lo sabe',
}

/// Urgencia del caso, la elige quien admite.
export const ETIQUETAS_PRIORIDAD = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
}

/// Respuestas del tamizaje previo a la admision.
export const ETIQUETAS_TAMIZAJE_GRADO = {
  SI: 'Si',
  MAS_O_MENOS: 'Mas o menos',
  NO: 'No',
}

export const ETIQUETAS_TAMIZAJE_CAPACIDAD = {
  SI: 'Si',
  CON_DIFICULTAD: 'Con dificultad',
  NO: 'No',
}

export const ETIQUETAS_TAMIZAJE_URGENCIA = {
  HOY: 'Hoy',
  ESTA_SEMANA: 'Esta semana',
  PUEDO_ESPERAR: 'Puedo esperar',
}

export const ETIQUETAS_FEEDBACK_SENTIR = {
  MUY_BIEN: 'Muy bien / Me sentí escuchada(o)',
  BIEN: 'Bien',
  REGULAR: 'Regular / Con dudas',
  INCOMODO: 'Incómoda(o) o insatisfecha(o)',
}

export const ETIQUETAS_FEEDBACK_TRATO = {
  EXCELENTE: 'Muy puntual y empático(a)',
  ADECUADO: 'Adecuado y respetuoso',
  A_MEJORAR: 'A mejorar (impuntualidad o desinterés)',
}

export const ETIQUETAS_FEEDBACK_HERRAMIENTAS = {
  MUCHA_CLARIDAD: 'Sí, me dio herramientas y claridad',
  ALGO: 'Me ayudó un poco / Desahogo',
  POCO_O_NADA: 'Poco o nada de herramientas',
}

export const ETIQUETAS_FEEDBACK_CALIDAD_SESION = {
  SIN_PROBLEMAS: 'Excelente comunicación',
  CON_DIFICULTADES: 'Hubo dificultades técnicas o de señal',
  PREFIERO_OTRA_MODALIDAD: 'Prefiere otra modalidad',
}

export const ETIQUETAS_FEEDBACK_CONTINUAR = {
  SI_MISMO: 'Desea continuar con el mismo profesional',
  CAMBIAR: 'Prefiere cambiar de profesional',
  SUFICIENTE: 'Siente que con esta sesión fue suficiente',
}
