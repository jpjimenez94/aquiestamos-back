import { prisma } from './src/config/database.js'
import { aprobarPostulacion } from './src/services/promotion.service.js'

async function autoAprobarTodos() {
  const volunteers = await prisma.volunteer.findMany({
    where: { deletedAt: null }
  })
  console.log('Procesando ' + volunteers.length + ' voluntarios...')
  let aprobados = 0
  let yaExistian = 0
  let errores = 0

  for (const v of volunteers) {
    try {
      const existe = await prisma.professional.findFirst({
        where: { volunteerId: v.id, deletedAt: null }
      })
      if (existe) {
        yaExistian++
        if (v.status !== 'ACTIVO') {
          await prisma.volunteer.update({ where: { id: v.id }, data: { status: 'ACTIVO' } })
        }
        continue
      }

      await aprobarPostulacion({
        volunteerId: v.id,
        ajustes: { status: 'ACTIVO' }
      })
      aprobados++
      console.log('✓ Aprobado:', v.fullName)
    } catch (err) {
      console.error('Error aprobando ' + v.fullName + ': ' + err.message)
      errores++
    }
  }

  console.log('Resumen final: ' + aprobados + ' nuevos aprobados, ' + yaExistian + ' ya existían, ' + errores + ' errores.')
}

autoAprobarTodos()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
