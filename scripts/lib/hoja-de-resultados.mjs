/**
 * HOJA DE RESULTADOS EN SITIO · ETAPA 15-E (A8)
 *
 * Los dieciséis escenarios que cierran la ETAPA 15 delante de los equipos: 5
 * de la cámara LPR, 5 de la terminal facial y 6 del videoportero. La hoja es
 * una PLANTILLA: el guion de sitio la escribe con lo que sabe (fecha, modo, qué
 * familias estaban declaradas, las latencias que midió como referencia) y la
 * persona rellena lo demás delante del aparato. Sin esta hoja rellenada la
 * ETAPA 15 no se cierra (`BE-02`): es el único documento que puede convertir
 * un «PROBADO CONTRA MOCK» en «VERIFICADO CONTRA HARDWARE».
 *
 * Cada fila tiene las columnas pedidas —CANAL (15-I) · esperado · obtenido ·
 * motivo en consola · latencia · evento en /eventos · evidencia— y un veredicto.
 * Un escenario que se lanza desde la app Y desde la consola son DOS filas. Sin
 * identificador de evento no hay PASA posible: RN-02 dice que no existe un
 * acceso sin evento, y la hoja no puede ser más laxa que la regla.
 *
 * Se puede ejecutar suelto para ver la plantilla:
 *   node scripts/lib/hoja-de-resultados.mjs
 */

/**
 * @typedef {'app'|'consola'} Canal
 * @typedef {{ id: string, familia: 'camara'|'terminal'|'videoportero', titulo: string, criterios: string, canales: Canal[], pasos: string[], esperado: string, motivo: string, umbral: string, ensayo: string }} Escenario
 */

/*
 * ETAPA 15-I · C-35. Los dieciséis del encargo: L1–L5 y T1–T5 son los cinco
 * del punto 6 POR CANAL (la autorización o la foto salen de la app del
 * residente o de la consola), y V1–V6 son los del videoportero de la 15-E (la
 * cadena única del encargo —timbre → aviso → vista en vivo → apertura— son
 * V1 + V3 + V4). Lo que la hoja tenía y el encargo no pedía no se pierde: pasa
 * a ADICIONALES, fuera del recuento (L6, L7, T6).
 *
 * La franja de las visitas es un DÍA con su hora de inicio y de fin (D5 b). Con
 * una visita de un solo día, «hora fuera» y «día distinto» salen los dos como
 * VIGENCIA_EXPIRADA: el dominio no distingue «aún no empieza» de «ya pasó».
 */

/** @type {Escenario[]} */
export const ESCENARIOS = [
  /* ── Cámara LPR · 5, con vehículo de TERCERO por autorización con día y franja ── */
  {
    id: 'L1',
    familia: 'camara',
    titulo: 'Tercero dentro de su día y su franja',
    criterios: 'CA-04 · CA-05 · KPI-13 · CP-02 · D5 b · hito 2 del reto',
    canales: ['app', 'consola'],
    pasos: [
      'Crear la visita del tercero con su placa, el día de hoy y una franja que contenga la hora actual (app: Nuevo visitante; consola: Visitantes → Nueva)',
      'Presentar el vehículo (o la placa impresa) a la cámara dentro de la franja',
    ],
    esperado: 'PERMITIDO; la barrera abre; evento con placa, fotografía y recorte',
    motivo: '— (permitido)',
    umbral: '< 3 000 ms desde la lectura hasta el relé (KPI-13)',
    ensayo: 'PERMITIDO por los dos canales; el simulado registró la apertura',
  },
  {
    id: 'L2',
    familia: 'camara',
    titulo: 'Placa desconocida',
    criterios: 'CA-05 · RN-01 · CP-03',
    canales: ['app', 'consola'],
    pasos: ['Presentar una placa que no está en el padrón ni en ninguna autorización'],
    esperado: 'NEGADO; la barrera NO se mueve; evento negado con evidencia',
    motivo: 'PLACA_DESCONOCIDA',
    umbral: 'decisión < 3 000 ms (la barrera no debe abrir en ningún momento)',
    ensayo: 'PLACA_DESCONOCIDA por los dos canales',
  },
  {
    id: 'L3',
    familia: 'camara',
    titulo: 'Día correcto, hora FUERA de la franja',
    criterios: 'CA-05 · CA-12 · RN-01 · D5 b',
    canales: ['app', 'consola'],
    pasos: [
      'Con la visita de L1, presentar la placa ese mismo día ANTES o DESPUÉS de la franja (p. ej. crear la franja una hora más tarde que ahora)',
    ],
    esperado: 'NEGADO; la barrera NO se mueve',
    motivo: 'VIGENCIA_EXPIRADA',
    umbral: 'decisión < 3 000 ms',
    ensayo: 'VIGENCIA_EXPIRADA por los dos canales',
  },
  {
    id: 'L4',
    familia: 'camara',
    titulo: 'Hora correcta, DÍA distinto',
    criterios: 'CA-05 · CA-12 · RN-01 · D5 b',
    canales: ['app', 'consola'],
    pasos: [
      'Crear la visita para MAÑANA con una franja que contenga la hora actual y presentar la placa hoy (o repetir L1 al día siguiente a la misma hora)',
    ],
    esperado: 'NEGADO; la barrera NO se mueve',
    motivo: 'VIGENCIA_EXPIRADA',
    umbral: 'decisión < 3 000 ms',
    ensayo: 'VIGENCIA_EXPIRADA por los dos canales',
  },
  {
    id: 'L5',
    familia: 'camara',
    titulo: 'Lista negra CON autorización vigente',
    criterios: 'CA-13 · RN-06 · RN-07 · CA-18 · KPI-25 · HU-35',
    canales: ['app', 'consola'],
    pasos: [
      'Con una visita VIGENTE para la placa, vetarla en la consola: Listas negras → Vetar (placa y motivo)',
      'Presentar la placa; cronometrar la alerta en la consola de guardia',
    ],
    esperado:
      'NEGADO por precedencia de la lista negra; alerta crítica al operador; la barrera NO abre',
    motivo: 'LISTA_NEGRA (no VIGENCIA_EXPIRADA ni PLACA_DESCONOCIDA)',
    umbral: 'alerta en la consola < 10 000 ms (CA-18)',
    ensayo: 'LISTA_NEGRA por los dos canales (veto por la ruta nueva de la consola)',
  },

  /* ── Terminal facial · 5: captura → consentimiento del VISITANTE → contador → verificación remota ── */
  {
    id: 'T1',
    familia: 'terminal',
    titulo: 'Rostro enrolado dentro de su día y su franja',
    criterios:
      'CU-02 · RN-09 · RN-10 · CA-07 · CA-08 · CA-09 · KPI-13 · KPI-16 · KPI-17 · CA-26 · hito 3 del reto',
    canales: ['app', 'consola'],
    pasos: [
      'Crear la visita del tercero (sin placa) para hoy con su franja',
      'Capturar su rostro (app: «Tomar su foto y pedirle el permiso», cámara del teléfono; consola: Rostro del visitante)',
      'Entregar el enlace al VISITANTE (QR o compartir) y que ÉL acepte desde su teléfono',
      'Comprobar que el conteo de la biblioteca de la terminal subió en uno (ficha del equipo o guion) y presentarse a la terminal dentro de la franja',
    ],
    esperado:
      'La plantilla llega a la terminal SÓLO tras aceptar; la terminal REPORTA y espera; la API decide PERMITIDO y la terminal abre; evento con método facial',
    motivo: '— (permitido)',
    umbral:
      'sincronización < 60 000 ms tras aceptar (KPI-17) · reconocimiento → apertura < 3 000 ms (KPI-13)',
    ensayo: 'PERMITIDO por los dos canales; antes de aceptar el contador no cambió, después sí',
  },
  {
    id: 'T2',
    familia: 'terminal',
    titulo: 'Rostro NO enrolado',
    criterios: 'CA-07 · RN-02',
    canales: ['app', 'consola'],
    pasos: ['Presentar a la terminal a una persona sin plantilla de Next Control'],
    esperado:
      'No abre. Si la terminal reporta el intento, la API lo registra NEGADO sin identidad; ninguna imagen queda como dato biométrico',
    motivo: 'negado sin identidad (hoy el evento lleva FALLO_TECNICO: no hay titular que evaluar)',
    umbral: '—',
    ensayo:
      'Negado por los dos canales; también con un número de empleado que no es UUID (H-15I-08)',
  },
  {
    id: 'T3',
    familia: 'terminal',
    titulo: 'Día correcto, hora FUERA de la franja',
    criterios: 'CA-12 · CA-26 · RN-01',
    canales: ['app', 'consola'],
    pasos: ['Con T1 hecho, presentarse el mismo día fuera de la franja'],
    esperado: 'La terminal NO abre aunque reconozca el rostro: decide la API (modo evento)',
    motivo: 'VIGENCIA_EXPIRADA',
    umbral: 'decisión < 3 000 ms; la puerta no se mueve',
    ensayo: 'VIGENCIA_EXPIRADA por los dos canales',
  },
  {
    id: 'T4',
    familia: 'terminal',
    titulo: 'Hora correcta, DÍA distinto',
    criterios: 'CA-12 · RN-01 · RN-11',
    canales: ['app', 'consola'],
    pasos: ['Presentarse al día siguiente a la misma hora'],
    esperado:
      'No abre. La plantilla vive lo que la visita (RN-11): al día siguiente ya se suprimió de la terminal y no la reconoce; si aún la reportara, la API la niega',
    motivo: 'SIN_CONSENTIMIENTO (la plantilla venció con la visita) o sin reconocimiento',
    umbral: 'decisión < 3 000 ms',
    ensayo: 'SIN_CONSENTIMIENTO por los dos canales (la plantilla ya había vencido)',
  },
  {
    id: 'T5',
    familia: 'terminal',
    titulo: 'Lista negra CON autorización vigente',
    criterios: 'CA-13 · RN-06 · RN-07 · HU-35',
    canales: ['app', 'consola'],
    pasos: [
      'Con T1 hecho y la visita vigente, vetar al visitante en la consola: Listas negras → Vetar (su documento y motivo)',
      'Presentarse a la terminal dentro de la franja',
    ],
    esperado: 'NEGADO por precedencia de la lista negra; la puerta NO abre',
    motivo: 'LISTA_NEGRA',
    umbral: 'decisión < 3 000 ms',
    ensayo: 'LISTA_NEGRA por los dos canales (veto por documento)',
  },
  /* ── Videoportero · 6 ───────────────────────────────────────────────── */
  /*
   * Lo que el videoportero del proyecto DECLARA en su volcado de capacidades
   * (docs/insumos, líneas citadas) manda sobre cualquier suposición:
   *   · suscripción de eventos: SÍ (línea 26) → la API se suscribe y recibe la
   *     llamada (voiceTalkEvent) sin configurar nada en el equipo;
   *   · señalización de llamada (callSignal): NO (línea 82) → contestar o colgar
   *     por señal NO APLICA POR CAPACIDAD; la llamada la atiende el aparato;
   *   · apertura remota de puerta: SÍ (línea 72) → por el proveedor, atribuida;
   *   · audio bidireccional: sus canales se descubren por su propia ruta (el
   *     volcado sólo declara 1 entrada y 1 salida de audio, líneas 22-25); se
   *     VERIFICÓ el 18/09 que existe con G.711 µ-law y estaba deshabilitado;
   *   · biblioteca de rostros y personas: NO CONSTAN en el volcado → el
   *     reconocimiento facial en el videoportero NO APLICA POR CAPACIDAD, salvo
   *     que la ficha del equipo (sondeo de la biblioteca) lo declare en sitio.
   */
  {
    id: 'V1',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Llamada del videoportero a una vivienda (aviso del timbre)',
    criterios: 'CU-03 · HU-25 · CA-18 · capacidad: suscripción de eventos = SÍ',
    pasos: [
      'Comprobar en la bitácora de la API que la escucha del videoportero está abierta (se rearma cada 30 s)',
      'Marcar en el videoportero el edificio y la unidad de una vivienda del padrón',
    ],
    esperado:
      'Aviso EMERGENTE en portería y en guardia virtual con la vivienda resuelta. Un timbre NO es un acceso: no deja fila en /eventos (en esa columna se anota «no aplica: aviso»). No depende de callSignal',
    motivo: '— (llamada avisada a las consolas)',
    umbral: 'aviso en la consola < 10 000 ms',
    ensayo: 'aviso emergente en portería y guardia; sin evento de acceso',
  },
  {
    id: 'V2',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Audio bidireccional por su propio canal · «Atender» por señalización NO APLICA',
    criterios: 'ADR-01 · HU-26 · CA-19 · KPI-33 · capacidad: callSignal = NO',
    pasos: [
      'Con el canal de audio HABILITADO en el equipo, pulsar «Atender» en la guardia virtual (https o localhost: el micrófono lo exige)',
      'Hablar y escuchar; abrir un segundo operador y pedir el mismo canal',
      'Anotar el formato que la consola muestra (cabecera del flujo) y compararlo con el del panel del equipo',
    ],
    esperado:
      'Se oye y se habla en el formato anunciado (G.711 µ-law); el canal se abrió por su ruta propia, sin señal de llamada; el segundo operador queda EN ESPERA; al colgar, el canal se cierra en el equipo. «Contestar/colgar por señalización»: NO APLICA POR CAPACIDAD (se anota, no se prueba)',
    motivo: '— (canal abierto: transporte equipo)',
    umbral: 'audio extremo a extremo < 2 000 ms (KPI-33), cronómetro en mano',
    ensayo: 'PROCEDIMIENTO EN SITIO: no hay audio real en simulado',
  },
  {
    id: 'V3',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Video en vivo por WHEP a través de la API',
    criterios: 'CA-19 · KPI-33 · RN-12 · RN-21',
    pasos: [
      'Con GO2RTC_URL en la API, seleccionar el videoportero en la guardia virtual (o pulsar el aviso de llamada)',
      'Leer en la consola «negociación N ms · primer cuadro M ms»; en las herramientas del navegador, comprobar que ninguna petición lleva rtsp:// ni la dirección del equipo',
    ],
    esperado:
      'Se ve la cámara del videoportero; el navegador sólo habla con /api/ncr; la latencia se muestra en pantalla',
    motivo: '— (en vivo)',
    umbral: 'primer cuadro < 2 000 ms (KPI-33)',
    ensayo: '503 sin GO2RTC_URL, que la API nombra; el vídeo real es de sitio',
  },
  {
    id: 'V4',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Apertura remota desde la central con motivo',
    criterios: 'CA-20 · RN-08 · KPI-32 · HU-27 · capacidad: apertura remota = SÍ',
    pasos: ['Con la llamada atendida, ABRIR desde la consola escribiendo el motivo'],
    esperado:
      'La puerta del videoportero abre por el proveedor; la orden queda atribuida al operador con su motivo en /ordenes (sobrevive a un reinicio de la API); evento de apertura',
    motivo: '— (orden manual: abrir)',
    umbral: 'orden → relé < 3 000 ms (KPI-32)',
    ensayo: 'apertura atribuida al operador, persistida en /ordenes y ejecutada por el proveedor',
  },
  {
    id: 'V5',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Negación con motivo y aviso al residente',
    criterios: 'CA-17 · RN-08 · HU-28',
    pasos: ['NEGAR desde la consola con motivo; pulsar «Avisar al residente»'],
    esperado:
      'La puerta NO se mueve; la negación queda registrada con motivo; el aviso al residente queda como alerta informativa persistida',
    motivo: '— (orden manual: negar)',
    umbral: '—',
    ensayo: 'negada con motivo; el simulado no registró apertura',
  },
  {
    id: 'V6',
    familia: 'videoportero',
    canales: ['consola'],
    titulo: 'Operador ocupado en otra copropiedad, escalamiento y emergencia · facial NO APLICA',
    criterios:
      'CU-03 flujos alternos · KPI-35 · HU-29 · CA-18 · RN-18 · capacidad: biblioteca de rostros = no consta',
    pasos: [
      'Con el operador atendiendo la copropiedad A, provocar una llamada en la B',
      'Conmutar a la B; comprobar que nada de la A se ve; pulsar EMERGENCIA con motivo',
      'Anotar lo que la FICHA del videoportero declara de biblioteca de rostros: si la declara, repetir T1–T5 sobre él; si no, escribir NO APLICA POR CAPACIDAD',
    ],
    esperado:
      'La llamada de B espera en cola con su tiempo; al conmutar no aparece ningún dato de A; la emergencia se escala con severidad crítica y persiste. Reconocimiento facial en el videoportero: NO APLICA POR CAPACIDAD salvo declaración de la ficha',
    motivo: '— (alerta: panico, crítica)',
    umbral: 'escalamiento < 10 000 ms (CA-18)',
    ensayo: 'PROCEDIMIENTO EN SITIO (el aislamiento al conmutar lo prueba KPI-35)',
  },
];

/**
 * Comprobaciones ADICIONALES: fuera de los dieciséis (C-35), pero se ejecutan.
 * Sin ellas se perderían D5 a, CU-01 3a y RN-11 en sitio.
 * @type {Escenario[]}
 */
export const ADICIONALES = [
  {
    id: 'L6',
    familia: 'camara',
    titulo: 'Vehículo PROPIO de residente a cualquier hora',
    criterios: 'D5 a · RN-04 · ADR-026',
    canales: ['app'],
    pasos: [
      'El residente registra su vehículo en la app (Vehículos → Registrar), vinculado a un ocupante',
      'Presentarlo a la cámara a una hora cualquiera',
    ],
    esperado:
      'PERMITIDO al instante, sin autorización; el tercer propio lo rechaza el servidor con su motivo',
    motivo: '— (permitido)',
    umbral: '< 3 000 ms (KPI-13)',
    ensayo: 'PERMITIDO a las 03:00; el tope por vivienda lo prueba residentes-y-vehiculos-pg',
  },
  {
    id: 'L7',
    familia: 'camara',
    titulo: 'Lectura de baja confianza y apertura manual con motivo',
    criterios: 'CU-01 exc. 3a · CA-16 · CA-17 · RN-08 · KPI-32',
    canales: ['consola'],
    pasos: [
      'Presentar la placa sucia, torcida o a medias para que la confianza baje del umbral (P-02: 80)',
      'En la portería, abrir A MANO escribiendo un motivo; repetir sin motivo',
    ],
    esperado:
      'Por debajo de 40: NEGADO. Entre 40 y 79: la cámara NO abre sola (H-15I-09); sin motivo la orden no se ejecuta; con motivo abre y queda atribuida',
    motivo:
      'CONFIANZA_INSUFICIENTE (inservible) · permitido sin apertura (dudosa) y, después, la orden manual con su motivo',
    umbral: 'orden manual → relé < 3 000 ms (KPI-32)',
    ensayo:
      'confianza 30 → CONFIANZA_INSUFICIENTE; confianza 60 → sin apertura automática, abierta a mano por el operador',
  },
  {
    id: 'T6',
    familia: 'terminal',
    titulo: 'Revocación del consentimiento y supresión inmediata',
    criterios: 'RN-11 · CA-10 · CA-11 · KPI-20 · KPI-21',
    canales: ['app', 'consola'],
    pasos: [
      'Desde el enlace del visitante (o la consola), REVOCAR el consentimiento',
      'Comprobar el conteo de la biblioteca de la terminal y presentarse otra vez',
    ],
    esperado:
      'La plantilla desaparece de la terminal de inmediato (conteo baja en uno); un intento posterior no reconoce a nadie',
    motivo: 'tras la revocación: sin reconocimiento o SIN_CONSENTIMIENTO',
    umbral: 'retirada de la terminal < 60 000 ms desde la revocación',
    ensayo: 'lo prueban biometria-pg y consentimiento-publico (revocación → supresión)',
  },
];

const ROTULO = {
  camara: 'Cámara LPR',
  terminal: 'Terminal facial',
  videoportero: 'Videoportero',
};

const celda = (texto) => String(texto).replace(/\|/g, '\\|');

/**
 * @param {{ fecha?: string, modo?: 'simulado'|'real', declaradas?: Record<string, boolean>, referencias?: string[] }} opciones
 * @returns {string} Markdown de la hoja
 */
export const hojaDeResultados = ({
  fecha = new Date().toISOString(),
  modo = 'real',
  declaradas = {},
  referencias = [],
} = {}) => {
  const lineas = [];
  const simulado = modo === 'simulado';
  lineas.push(
    `# Hoja de resultados en sitio · ETAPA 15${simulado ? ' (PLANTILLA GENERADA EN SIMULADO)' : ''}`,
  );
  lineas.push('');
  lineas.push(`Generada: ${fecha} · Guion: \`scripts/puesta-en-marcha-equipos.mjs\``);
  lineas.push('');
  lineas.push('| Campo | Valor |');
  lineas.push('| --- | --- |');
  lineas.push('| Copropiedad de prueba | _(nombre, sin dirección ni credenciales)_ |');
  lineas.push('| Quién ejecuta | _(nombre y rol)_ |');
  lineas.push('| Versión desplegada | _(commit de `develop` o de la rama)_ |');
  lineas.push(
    `| Equipos declarados al guion | ${['camara', 'terminal', 'videoportero']
      .map((f) => `${ROTULO[f]}: ${declaradas[f] === true ? 'sí' : 'NO'}`)
      .join(' · ')} |`,
  );
  lineas.push('');
  lineas.push('## Reglas de la hoja');
  lineas.push('');
  lineas.push(
    '- **Esperado** ya está escrito: es el criterio del documento de requisitos. No se edita.',
  );
  lineas.push('- **Obtenido**: lo que pasó, en una frase, aunque coincida con lo esperado.');
  lineas.push('- **Motivo en consola**: el motivo tipado que muestra la consola (o «permitido»).');
  lineas.push('- **Latencia**: en milisegundos y de dónde sale (consola, `/ordenes`, cronómetro).');
  lineas.push(
    '- **Evento en /eventos**: el identificador del evento. **Sin identificador no hay PASA** (RN-02).',
  );
  lineas.push(
    '- **Evidencia**: nombre del archivo o de la URL firmada que se descargó, sin la URL entera.',
  );
  lineas.push(
    '- **Veredicto**: `PASA` sólo si obtenido = esperado Y la latencia está dentro del umbral. Todo lo demás es `FALLA`, con el motivo en «Obtenido».',
  );
  lineas.push(
    '- Un escenario que no se pudo ejecutar se marca `NO EJECUTADO` y por qué. No se deja en blanco.',
  );
  lineas.push('');
  lineas.push(
    '- **Canal**: por dónde se lanza el escenario. `app`: la visita o la foto salen de la app del residente; `consola`: de la consola web. Cada canal es una fila y un veredicto.',
  );
  lineas.push('');
  const tabla = (lista) => {
    lineas.push(
      '| # | Canal | Escenario | Esperado | Obtenido | Motivo en consola | Latencia (ms) | Evento en /eventos | Evidencia | Veredicto |',
    );
    lineas.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const e of lista) {
      for (const canal of e.canales) {
        lineas.push(
          `| ${e.id} | ${canal} | ${celda(e.titulo)} | ${celda(e.esperado)} · umbral: ${celda(e.umbral)} | | esperado: ${celda(e.motivo)} | | | | |`,
        );
      }
    }
    lineas.push('');
  };
  const detalle = (e) => {
    lineas.push(`### ${e.id} · ${e.titulo}`);
    lineas.push('');
    lineas.push(`- Canal: ${e.canales.join(' y ')}`);
    lineas.push(`- Criterios: ${e.criterios}`);
    lineas.push('- Pasos:');
    e.pasos.forEach((p, i) => lineas.push(`  ${String(i + 1)}. ${p}`));
    lineas.push(`- Esperado: ${e.esperado}`);
    lineas.push(`- Motivo esperado en consola: ${e.motivo}`);
    lineas.push(`- Umbral: ${e.umbral}`);
    lineas.push(`- Ensayo previo (SIMULADO): ${e.ensayo}`);
    lineas.push('');
  };
  for (const familia of ['camara', 'terminal', 'videoportero']) {
    const filas = ESCENARIOS.filter((e) => e.familia === familia);
    lineas.push(`## ${ROTULO[familia]} · ${String(filas.length)} escenarios`);
    lineas.push('');
    tabla(filas);
    filas.forEach(detalle);
  }
  lineas.push(
    `## Comprobaciones adicionales · ${String(ADICIONALES.length)} (fuera de los 16, C-35)`,
  );
  lineas.push('');
  tabla(ADICIONALES);
  ADICIONALES.forEach(detalle);
  lineas.push('## Referencias medidas por el guion en esta ejecución');
  lineas.push('');
  if (referencias.length === 0) {
    lineas.push('_(ninguna: el guion no accionó ni abrió audio en esta ejecución)_');
  } else {
    for (const r of referencias) lineas.push(`- ${r}`);
  }
  lineas.push('');
  lineas.push(
    'Son cotas INFERIORES: miden sólo el tramo API → equipo. La latencia de cada escenario se mide de extremo a extremo, delante del aparato.',
  );
  lineas.push('');
  lineas.push('## Resumen');
  lineas.push('');
  lineas.push('| Familia | Escenarios | Filas (escenario × canal) | PASA | FALLA | NO EJECUTADO |');
  lineas.push('| --- | --- | --- | --- | --- | --- |');
  const filasDe = (lista) => lista.reduce((n, e) => n + e.canales.length, 0);
  for (const familia of ['camara', 'terminal', 'videoportero']) {
    const lista = ESCENARIOS.filter((e) => e.familia === familia);
    lineas.push(
      `| ${ROTULO[familia]} | ${String(lista.length)} | ${String(filasDe(lista))} | | | |`,
    );
  }
  lineas.push(
    `| **Total** | **${String(ESCENARIOS.length)}** | **${String(filasDe(ESCENARIOS))}** | | | |`,
  );
  lineas.push('');
  lineas.push(
    '**La ETAPA 15 se cierra sólo con los 16 escenarios en PASA por cada canal que les aplica**, o con cada FALLA convertida en un defecto con dueño y una nueva ejecución de la hoja. El ensayo previo SIMULADO está en `docs/guias/ENSAYO_PREVIO_EN_SITIO.md`.',
  );
  if (simulado) {
    lineas.push('');
    lineas.push(
      '> Esta plantilla salió de una ejecución SIMULADA: no se habló con ningún aparato. Sirve para ensayar, no para verificar.',
    );
  }
  lineas.push('');
  return lineas.join('\n');
};

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.stdout.write(hojaDeResultados({ modo: 'simulado' }));
}
