import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Las portadas y los PDF se sirven desde `frontend/public`. Si algún día se
// suben a un CDN, basta con apuntar ASSET_BASE a esa URL.
const ASSET_BASE = process.env.RESOURCE_ASSET_BASE ?? ''

const categories = [
  {
    slug: 'acompanamiento-ante-emergencias',
    name: 'Acompañamiento ante emergencias',
    position: 1,
    resources: [
      {
        slug: 'erase-una-vez-unos-valientes',
        title: 'Erase una vez unos valientes',
        description:
          'Cuento sobre la valentía y la esperanza para acompañar a niñas y niños después de una experiencia difícil.',
        coverImage: '/images/rec-valientes.png',
        fileUrl: '/recursos/erase-una-vez-unos-valientes.pdf',
        fileName: 'Cuento_erase_una_vez_unos_valientes.pdf',
        icon: 'sun',
        position: 1,
      },
      {
        slug: 'el-monstruo-toti-y-el-baile-del-planeta',
        title: 'El monstruo Toti y el baile del planeta',
        description:
          'Cuento ilustrado que explica los temblores de una manera sencilla y cercana para las niñas y los niños.',
        coverImage: '/images/rec-toti.png',
        fileUrl: '/recursos/el-monstruo-toti.pdf',
        fileName: 'cuento_el_monstruo_toti_y_el_baile_del_planeta.pdf',
        icon: 'sun',
        position: 2,
      },
      {
        slug: 'ana-y-el-terremoto',
        title: 'Ana y el terremoto',
        description:
          'Cuento que acompaña a niñas y niños a comprender lo ocurrido y expresar el miedo después de un terremoto.',
        coverImage: '/images/rec-ana.jpg',
        fileUrl: '/recursos/ana-y-el-terremoto.pdf',
        fileName: 'ana-y-el-terremoto.pdf',
        icon: 'sparkles',
        position: 3,
      },
    ],
  },
  {
    slug: 'autorregulacion',
    name: 'Autorregulación',
    position: 2,
    resources: [
      {
        slug: 'respira',
        title: 'Respira',
        description:
          'Cuento-guía con ejercicios sencillos de respiración para ayudar a niñas y niños a recuperar la calma y regular sus emociones.',
        coverImage: '/images/rec-respira.png',
        fileUrl: '/recursos/respira.pdf',
        fileName: 'respira_compressed.pdf',
        icon: 'accessibility',
        position: 1,
      },
      {
        slug: 'mi-miedo-mi-guardian-personal',
        title: 'Mi miedo, mi guardián personal',
        description:
          'Lectura que ayuda a comprender el miedo y reconocerlo como una emoción que puede protegernos ante situaciones difíciles.',
        coverImage: '/images/rec-miedo.png',
        fileUrl: '/recursos/mi-miedo-mi-guardian-personal.pdf',
        fileName: 'mi_miedo_mi_guardian_personal.pdf',
        icon: 'accessibility',
        position: 2,
      },
    ],
  },
  {
    slug: 'contencion-emocional',
    name: 'Contención emocional',
    position: 3,
    resources: [
      {
        slug: 'plaza-sesamo-contencion-emocional',
        title: 'Plaza Sesamo - Contención emocional',
        description:
          'Material pensado para acompañar y contener emocionalmente a niñas y niños durante momentos difíciles o después de una emergencia.',
        coverImage: '/images/rec-plaza-sesamo.png',
        fileUrl: '/recursos/plaza-sesamo-contencion-emocional.pdf',
        fileName: 'material_plaza_sesamo_contencion_emocional.pdf',
        icon: 'heart',
        position: 1,
      },
    ],
  },
  {
    slug: 'sobre-el-duelo-y-la-muerte',
    name: 'Sobre el duelo y la muerte',
    position: 4,
    resources: [
      {
        slug: 'vacio',
        title: 'Vacio',
        description:
          'Cuento sobre la sensación de vacío que puede aparecer después de una pérdida y el proceso de encontrar nuevas formas de habitarla.',
        coverImage: '/images/rec-vacio.png',
        fileUrl: '/recursos/vacio.pdf',
        fileName: 'vacio_cuento.pdf',
        icon: 'feather',
        position: 1,
      },
      {
        slug: 'el-arbol-de-los-recuerdos',
        title: 'El árbol de los recuerdos',
        description:
          'Cuento que acompaña a niñas y niños a elaborar la pérdida y mantener vivo, con cariño, el recuerdo de quienes ya no están.',
        coverImage: '/images/rec-arbol.png',
        fileUrl: '/recursos/el-arbol-de-los-recuerdos.pdf',
        fileName: 'cuento-el-arbol-de-los-recuerdos.pdf',
        icon: 'feather',
        position: 2,
      },
    ],
  },
]

async function main() {
  console.log('[seed] Cargando "Recursos para todos"...')

  for (const category of categories) {
    const { resources, ...categoryData } = category

    const saved = await prisma.resourceCategory.upsert({
      where: { slug: categoryData.slug },
      update: { name: categoryData.name, position: categoryData.position },
      create: categoryData,
    })

    for (const resource of resources) {
      const payload = {
        ...resource,
        coverImage: `${ASSET_BASE}${resource.coverImage}`,
        fileUrl: `${ASSET_BASE}${resource.fileUrl}`,
        collection: 'Cuentos infantiles',
        categoryId: saved.id,
      }

      await prisma.resource.upsert({
        where: { slug: resource.slug },
        update: payload,
        create: payload,
      })
    }

    console.log(`[seed]   ✔ ${categoryData.name} (${resources.length} recursos)`)
  }

  const total = await prisma.resource.count()
  console.log(`[seed] Listo. ${total} recursos en la base de datos.`)
}

main()
  .catch((error) => {
    console.error('[seed] Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
