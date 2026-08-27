# Aquí Estamos — API

Red de acompañamiento psicológico y atención en crisis.
Node 20 · Express · Prisma · PostgreSQL · desplegado en Railway.

---

## Lo primero: la base de datos

**Antes de correr nada, ten claro contra qué base estás trabajando.**

Este proyecto existe con una particularidad que conviene saber desde el minuto
uno: `.env` apunta a la base de **producción** en Railway. No es un descuido —
a veces hay que depurar contra datos reales— pero significa que `npm run dev` y
`npx prisma studio` tocan las historias de personas reales.

Eso ya causó un incidente. Una corrida de `npm test` borró 53 avisos de la
bandeja de producción, porque el `globalSetup` de vitest hace
`notification.deleteMany({})` sin filtro. Desde entonces hay dos protecciones:

- Las pruebas cargan `.env.test`, que apunta a una base local, **antes** que
  `.env`. Como dotenv no pisa lo ya definido, la base de pruebas gana siempre.
- `src/config/baseSegura.js` aborta la tanda entera si `DATABASE_URL` no es
  local. No avisa: se niega a arrancar.

Al levantar el servidor contra una base remota verás un aviso en la consola.
Está ahí para que nadie pueda alegar despiste, no para que lo ignores.

## Levantar el Postgres local

Hay un PostgreSQL 16 portátil junto a los repositorios. **No es un servicio de
Windows**: hay que arrancarlo a mano después de cada reinicio. Desde la carpeta
que contiene `aquiestamos-back` y `aquiestamos-front`:

```powershell
.\pgsql\bin\pg_ctl.exe -D .\pgdata -o "-p 5434" -l .\pgdata\arranque.log start
```

Para pararlo:

```powershell
.\pgsql\bin\pg_ctl.exe -D .\pgdata stop
```

Escucha en el **5434**, no en el 5432, y la autenticación es `trust`: cualquier
contraseña vale.

Bases que tiene que haber en esa instancia:

| Base                  | Para qué                                            |
| --------------------- | --------------------------------------------------- |
| `aqui_estamos`        | Desarrollo                                          |
| `aqui_estamos_test`   | Pruebas. Es la que dice `.env.test`                 |
| `aqui_estamos_shadow` | Shadow de Prisma, para `migrate dev` y `migrate diff` |

Esa instalación de Postgres es mínima: trae `pg_ctl`, `postgres` e `initdb`,
pero **no `psql` ni `createdb`**. Para crear una base, lo más corto es un
script de Node desde este directorio:

```js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5434/postgres' } },
})
await prisma.$executeRawUnsafe('CREATE DATABASE "aqui_estamos_test"')
await prisma.$disconnect()
```

Con las bases creadas:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/aqui_estamos_test" npx prisma migrate deploy
```

## Arrancar

```bash
npm install
npx prisma generate
npm run dev
```

Copia `.env.example` a `.env` y rellénalo. Dos variables no tienen valor por
defecto y el servidor **no arranca** sin ellas, a propósito:

- `SHARED_CASE_SECRET` — firma los enlaces de caso y de tamizaje
- `MEETING_SECRET` — firma los enlaces de sala de videollamada

Las dos existen porque antes había un `|| 'valor-por-defecto'` en el código, y
un secreto por defecto publicado en GitHub es un secreto público. Fallar
ruidosamente es mucho mejor que fallar en silencio.

## Comandos

```
npm run dev               servidor con recarga
npm test                  la suite completa (usa .env.test)
npm run test:watch        en modo continuo

npm run prisma:migrate    crear una migración nueva
npm run prisma:deploy     aplicar migraciones
npm run prisma:studio     explorador de la base

npm run db:seed           datos de arranque
npm run db:seed-admin     primera cuenta de administración
npm run db:purgar         política de retención (simulacro; --si borra)
npm run correo:probar     comprobar el envío de correo
npm run avisos:despachar  vaciar la cola de avisos a mano
```

## Cómo está organizado

```
routes/ → middlewares (authenticate → authorize → validate) → controllers/
                                                                   ↓
                                              services/ (reglas) ←→ models/ (Prisma)
                                                                   ↓
                                                              views/ (qué sale)
```

Cuatro reglas que el código ya sigue y conviene no romper:

1. **Los permisos viven solo en `auth/permissions.js`.** Nunca
   `if (usuario.role === 'ADMIN')` dentro de un controlador: si la regla se
   reparte, añadir un rol obliga a revisar todo el backend.
2. **Los estados cambian con `exigirTransicion()`.** Las máquinas de estados de
   la cita y de la asignación están centralizadas justo para que nadie deje una
   cita cancelada marcada como realizada.
3. **Nadie deriva dos veces lo mismo.** La vista y el controlador calculaban
   cada uno por su cuenta el nombre de la sala de videollamada, y no coincidían:
   el profesional entraba a una sala vacía mientras la persona esperaba en otra.
4. **Los textos de cara al usuario se buscan primero en Parametrización.** Hay
   31 claves editables desde el portal antes de escribir un texto en el código.

## Trabajo de fondo

Cinco trabajos arrancan con el servidor: el despachador de avisos (cada 30 s) y
los barridos de admisión, asignaciones y citas (cada hora).

Todos pasan por `conCerrojo()`, que pide un turno a PostgreSQL. Con una sola
instancia da igual; el día que Railway pase a dos réplicas —un clic, sin
desplegar— es lo que impide que cada correo salga duplicado.

Si añades un trabajo periódico, dale su propio número en `CERROJOS` y pásalo
por ahí.

## Despliegue

Railway despliega desde `main`. El arranque corre
`prisma generate && prisma migrate deploy && npm start`, así que **los cambios
de esquema van en una migración**, nunca en `db push`. Hubo una deriva de siete
modelos que vivían en el esquema sin migración que los creara; recuperarla
costó un día y un `migrate resolve` contra producción.
