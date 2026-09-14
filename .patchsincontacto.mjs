import fs from 'node:fs'

function editar(ruta, cambios) {
  const bruto = fs.readFileSync(ruta, 'utf8')
  const crlf = bruto.includes('\r\n')
  let s = bruto.replace(/\r\n/g, '\n')
  for (const [nombre, viejo, nuevo] of cambios) {
    const n = s.split(viejo).length - 1
    if (n !== 1) throw new Error('ancla ' + n + ': ' + nombre)
    s = s.replace(viejo, nuevo)
    console.log('  ·', ruta, '→', nombre)
  }
  fs.writeFileSync(ruta, crlf ? s.replace(/\n/g, '\r\n') : s)
}

// ── 1 · La persona a la que no se logra contactar ──────────────────────
editar('prisma/schema.prisma', [
  [
    'columnas de contacto',
    `  status   PatientStatus @default(NUEVO)`,
    `  status   PatientStatus @default(NUEVO)

  /// A quién no se ha podido contactar para agendar, y desde cuándo.
  ///
  /// Se llama, se escribe, y no contesta —o el número está mal escrito—. Esa
  /// persona se quedaba en «Por asignar» sin decir por qué, mezclada con las
  /// que sí esperan que alguien las asigne: la columna crecía y no se sabía
  /// cuáles eran un caso pendiente de verdad y cuáles un teléfono que no
  /// responde.
  ///
  /// No es un estado del caso: sigue siendo NUEVO o EN_ADMISION, porque no ha
  /// pasado nada con ella — solo no hemos conseguido hablarle. Cuando por fin
  /// contesta, o cuando se le asigna profesional, la marca se borra sola.
  unreachableSince  DateTime? @map("unreachable_since") @db.Timestamptz(3)
  /// El último intento, para saber cuándo toca volver a llamar.
  unreachableLastAt DateTime? @map("unreachable_last_at") @db.Timestamptz(3)
  /// Cuántas veces se ha intentado. Tres intentos ya dicen algo.
  unreachableTries  Int       @default(0) @map("unreachable_tries")
  /// NO_CONTESTA | NUMERO_ERRADO | OTRO — el del último intento.
  unreachableReason String?   @map("unreachable_reason") @db.VarChar(40)
  unreachableBy     String?   @map("unreachable_by") @db.VarChar(160)`,
  ],
  [
    'índice para el tablero',
    `  @@index([status])`,
    `  @@index([status])
  /// El tablero separa a quienes no contestan del resto de «Por asignar».
  @@index([unreachableSince])`,
  ],
])

// ── 2 · El permiso, donde se deciden los permisos ──────────────────────
editar('src/auth/permissions.js', [
  [
    'permiso del agendador',
    `    // Corregir una nota de seguimiento ya escrita. Es quien más las escribe
    // —recibe, llama y agenda— y quien antes ve el dato equivocado.
    'paciente:nota-editar',`,
    `    // Corregir una nota de seguimiento ya escrita. Es quien más las escribe
    // —recibe, llama y agenda— y quien antes ve el dato equivocado.
    'paciente:nota-editar',
    // Marcar que no se logra contactar a alguien. Es quien llama, así que es
    // quien sabe que el teléfono da apagado por cuarta vez.
    'paciente:contacto',`,
  ],
  [
    'permiso de gestión de casos',
    `    'paciente:editar',
    'paciente:nota-editar',`,
    `    'paciente:editar',
    'paciente:nota-editar',
    'paciente:contacto',`,
  ],
])
