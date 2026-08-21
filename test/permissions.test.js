import { describe, it, expect } from 'vitest'
import { puede, permisosDe, PERMISOS, ROLES } from '../src/auth/permissions.js'

const admin = { role: 'ADMIN' }
const agendador = { role: 'AGENDADOR' }
const profesional = { role: 'PROFESIONAL' }

describe('matriz de permisos', () => {
  it('el administrador puede todo', () => {
    for (const permiso of ['usuario:crear', 'auditoria:leer', 'cita:cancelar', 'lo:que:sea']) {
      expect(puede(admin, permiso)).toBe(true)
    }
  })

  it('el agendador agenda pero no administra cuentas', () => {
    expect(puede(agendador, 'cita:crear')).toBe(true)
    expect(puede(agendador, 'cita:cancelar')).toBe(true)
    expect(puede(agendador, 'solicitud:leer')).toBe(true)

    expect(puede(agendador, 'usuario:crear')).toBe(false)
    expect(puede(agendador, 'usuario:borrar')).toBe(false)
    expect(puede(agendador, 'auditoria:leer')).toBe(false)
  })

  it('el agendador aprueba y admite: es quien opera la entrada', () => {
    expect(puede(agendador, 'profesional:crear')).toBe(true)
    expect(puede(agendador, 'paciente:crear')).toBe(true)
  })

  it('el agendador no ve profesionales ni el voluntariado de apoyo', () => {
    // Decisión expresa de la red: puede aprobar y asignar, pero los datos
    // maestros no son suyos. El emparejamiento va por asignacion:crear.
    expect(puede(agendador, 'profesional:leer')).toBe(false)
    expect(puede(agendador, 'colaborador:leer')).toBe(false)
    expect(puede(agendador, 'asignacion:crear')).toBe(true)
  })

  it('el rol de lectura ve todo y no toca nada', () => {
    const lectura = { role: 'LECTURA' }

    for (const permiso of [
      'postulacion:leer', 'solicitud:leer', 'colaborador:leer',
      'profesional:leer', 'paciente:leer', 'agenda:leer',
      'usuario:leer', 'auditoria:leer',
    ]) {
      expect(puede(lectura, permiso)).toBe(true)
    }

    for (const permiso of [
      'paciente:crear', 'profesional:crear', 'cita:crear', 'cita:cancelar',
      'asignacion:crear', 'usuario:crear', 'usuario:borrar', 'paciente:editar',
    ]) {
      expect(puede(lectura, permiso)).toBe(false)
    }
  })

  it('ningún permiso del rol de lectura permite escribir', () => {
    // Si esto falla, alguien le dio al rol un permiso que no termina en
    // :leer, y "solo lectura" dejó de ser cierto.
    for (const permiso of PERMISOS.LECTURA) {
      expect(permiso.endsWith(':leer')).toBe(true)
    }
  })

  it('el profesional solo ve su propia agenda', () => {
    expect(puede(profesional, 'agenda:leer:propia')).toBe(true)

    expect(puede(profesional, 'agenda:leer')).toBe(false)
    expect(puede(profesional, 'cita:crear')).toBe(false)
    expect(puede(profesional, 'solicitud:leer')).toBe(false)
    expect(puede(profesional, 'usuario:leer')).toBe(false)
  })

  it('cualquiera con sesión gestiona su propio perfil', () => {
    for (const usuario of [admin, agendador, profesional]) {
      expect(puede(usuario, 'perfil:leer:propio')).toBe(true)
      expect(puede(usuario, 'perfil:cambiar-clave')).toBe(true)
    }
  })

  it('sin usuario o con rol desconocido no se concede nada', () => {
    expect(puede(null, 'solicitud:leer')).toBe(false)
    expect(puede(undefined, 'solicitud:leer')).toBe(false)
    expect(puede({}, 'solicitud:leer')).toBe(false)
    expect(puede({ role: 'INVENTADO' }, 'solicitud:leer')).toBe(false)
  })

  it('ningún rol distinto de ADMIN tiene el comodín', () => {
    for (const rol of ROLES.filter((r) => r !== 'ADMIN')) {
      expect(PERMISOS[rol]).not.toContain('*')
    }
  })

  it('permisosDe expone la lista para el portal', () => {
    expect(permisosDe('ADMIN')).toEqual(['*'])
    expect(permisosDe('AGENDADOR')).toContain('cita:crear')
    expect(permisosDe('AGENDADOR')).toContain('perfil:cambiar-clave')
    expect(permisosDe('INVENTADO')).toEqual(['perfil:leer:propio', 'perfil:cambiar-clave'])
  })
})
