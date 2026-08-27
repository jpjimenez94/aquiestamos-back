import { prisma } from './database.js'

/**
 * Cerrojo compartido entre instancias, para el trabajo de fondo.
 *
 * Los cuatro barridos y el despachador de avisos corren con `setInterval`
 * dentro del proceso. Cada uno tiene su bandera `corriendo` para no montarse
 * encima de sí mismo, y eso basta MIENTRAS haya una sola instancia.
 *
 * El día que alguien suba las réplicas de Railway de 1 a 2 —un clic, sin
 * desplegar código— las dos instancias despiertan a la vez sobre la misma
 * base. Cada aviso pendiente sale por duplicado, cada asignación vencida se
 * libera dos veces y cada recordatorio le llega dos veces a quien está
 * esperando su sesión. Nada en el código avisaría; simplemente empezaría a
 * pasar.
 *
 * Un cerrojo de PostgreSQL lo cierra antes de que ocurra: la primera instancia
 * que lo toma trabaja, la segunda encuentra ocupado y se va sin hacer nada.
 * No hay coordinación que mantener ni infraestructura que añadir: la base ya
 * está ahí y ya es el punto de encuentro de todos.
 */

/**
 * Cada trabajo tiene su propio número. Son arbitrarios pero fijos: cambiar uno
 * es dejar de excluirse con la versión anterior durante un despliegue, que es
 * justo el momento en que hay dos instancias vivas a la vez.
 */
export const CERROJOS = {
  AVISOS: 4210001,
  ADMISION: 4210002,
  ASIGNACIONES: 4210003,
  CITAS: 4210004,
}

/**
 * Corre `trabajo` solo si nadie más lo está corriendo.
 *
 * Devuelve lo que devuelva `trabajo`, o `null` si el cerrojo estaba tomado.
 * No espera: si otra instancia va por delante, esta pasada se salta y la
 * siguiente llega en un minuto o en una hora. Para trabajo periódico eso es
 * exactamente lo que se quiere; encolarse solo acumularía tandas.
 *
 * El cerrojo se pide DENTRO de una transacción a propósito. Prisma reparte las
 * consultas entre las conexiones de su pool, así que un `pg_advisory_lock` de
 * sesión se podría tomar en una conexión y soltar en otra. La variante `_xact`
 * vive atada a la transacción y la suelta Postgres al cerrarla, incluso si el
 * proceso se muere a mitad: no hay forma de dejar un cerrojo huérfano.
 *
 * `trabajo` corre con el cliente normal, no con el de la transacción. El
 * cerrojo aquí es un turno, no un límite de aislamiento: no está protegiendo
 * la consistencia de unas lecturas, está impidiendo que dos máquinas hagan lo
 * mismo. El `timeout` alto es porque la transacción sigue abierta mientras
 * dure el trabajo.
 */
export async function conCerrojo(numero, trabajo) {
  // Distingue quién falló. Un fallo AL COORDINAR se traga: si la base no
  // responde, el trabajo iba a fallar igual un segundo después y con un
  // mensaje más claro. Un fallo DEL TRABAJO se propaga, porque cada quien que
  // llama a esto tiene su `.catch` para dejarlo en el log; tragárselo aquí
  // dejaría los barridos mudos, fallando en silencio para siempre.
  let entroAlTrabajo = false

  try {
    return await prisma.$transaction(
      async (tx) => {
        const filas = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${numero}::bigint) AS tomado`
        if (!filas?.[0]?.tomado) return null

        entroAlTrabajo = true
        return await trabajo()
      },
      { timeout: 1000 * 60 * 10, maxWait: 1000 * 5 },
    )
  } catch (error) {
    if (entroAlTrabajo) throw error

    console.error(`[cerrojo ${numero}] no se pudo coordinar:`, error.message)
    return null
  }
}
