import { db } from '../db.js'
import { createHmac } from 'node:crypto'

// Usamos el DATABASE_URL como semilla, o un secreto específico si existiera.
function signToken(patientId, email) {
  const secret = process.env.DATABASE_URL || 'secret'
  const payload = `${patientId}:${email}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}

function verifyToken(token, patientId) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  const [tokenPatientId, email] = payload.split(':')
  
  if (tokenPatientId !== patientId) return null
  
  const secret = process.env.DATABASE_URL || 'secret'
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex')
  
  if (signature !== expectedSignature) return null
  return email
}

export async function authorizeSharedCase(req, res) {
  const { id } = req.params // patient id
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ success: false, message: 'Correo obligatorio' })
  }

  // Verificar que el correo pertenece a un profesional ACTIVO
  const professional = await db.professional.findFirst({
    where: { email: email.trim().toLowerCase(), status: 'ACTIVO' }
  })

  if (!professional) {
    return res.status(403).json({ success: false, message: 'El correo no corresponde a un profesional activo de la red.' })
  }

  // Verificar si este profesional está asignado a ESTE paciente.
  const assignment = await db.caseAssignment.findFirst({
    where: {
      patientId: id,
      professionalId: professional.id,
      status: 'ACTIVA'
    }
  })

  if (!assignment) {
    return res.status(403).json({ success: false, message: 'No estás asignado a este caso.' })
  }

  // Generar un token ligero
  const token = signToken(id, professional.email)

  res.json({
    success: true,
    data: { token }
  })
}

export async function getSharedCase(req, res) {
  const { id } = req.params
  const token = req.headers['x-shared-case-token']

  const email = verifyToken(token, id)
  if (!email) {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado o expirado.' })
  }

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { status: 'ACTIVA' },
        include: { professional: true }
      },
      appointments: {
        orderBy: { startsAt: 'asc' },
        include: { professional: true }
      }
    }
  })

  if (!patient) {
    return res.status(404).json({ success: false, message: 'Paciente no encontrado.' })
  }

  res.json({
    success: true,
    data: patient
  })
}
