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
  OTRO: 'Otra cosa',
}
