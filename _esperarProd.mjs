import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const limite = Date.now() + 4 * 60 * 1000
let ultimo = ''

while (Date.now() < limite) {
  const a = await p.notification.findFirst({
    where: { entity: 'prueba' },
    select: { status: true, attempts: true, lastError: true, sentAt: true },
  })

  if (!a) { console.log('el aviso de prueba ya no está'); break }

  const estado = `${a.status} intentos=${a.attempts}${a.lastError ? ' err=' + a.lastError.slice(0, 60) : ''}`
  if (estado !== ultimo) { console.log(new Date().toISOString().slice(11, 19), estado); ultimo = estado }

  if (a.status === 'ENVIADA') { console.log('ENVIADO desde producción'); break }
  await new Promise((r) => setTimeout(r, 10000))
}

await p.$disconnect()
