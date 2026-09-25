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
 * Cada fila tiene las seis columnas pedidas —esperado · obtenido · motivo en
 * consola · latencia · evento en /eventos · evidencia— y un veredicto. Sin
 * identificador de evento no hay PASA posible: RN-02 dice que no existe un
 * acceso sin evento, y la hoja no puede ser más laxa que la regla.
 *
 * Se puede ejecutar suelto para ver la plantilla:
 *   node scripts/lib/hoja-de-resultados.mjs
 */

/** @typedef {{ id: string, familia: 'camara'|'terminal_facial'|'intercom', titulo: string, criterios: string, pasos: string[], esperado: string, motivo: string, umbral: string }} Escenario */

/** @type {Escenario[]} */
export const ESCENARIOS = [
  /* ── Cámara LPR · 5 ─────────────────────────────────────────────────── */
  {
    id: 'L1',
    familia: 'camara',
    titulo: 'Placa con autorización vigente',
    criterios: 'CA-04 · CA-05 · KPI-13 · CP-02 · hito 2 del reto',
    pasos: [
      'Crear desde la app del residente una autorización vigente con placa vehicular',
      'Presentar el vehículo (o la placa impresa) a la cámara',
    ],
    esperado: 'PERMITIDO; la barrera abre; evento con placa, fotografía y recorte',
    motivo: '— (permitido)',
    umbral: '< 3 000 ms desde la lectura hasta el relé (KPI-13)',
  },
  {
    id: 'L2',
    familia: 'camara',
    titulo: 'Placa sin autorización',
    criterios: 'CA-05 · RN-01 · CP-03',
    pasos: ['Presentar una placa que no está en el padrón ni en ninguna autorización'],
    esperado: 'NEGADO; la barrera NO se mueve; evento negado con evidencia',
    motivo: 'PLACA_DESCONOCIDA',
    umbral: 'decisión < 3 000 ms (la barrera no debe abrir en ningún momento)',
  },
  {
    id: 'L3',
    familia: 'camara',
    titulo: 'Placa con autorización vencida',
    criterios: 'CA-05 · CA-12 · RN-01',
    pasos: [
      'Crear una autorización cuya vigencia ya terminó (o esperar a que termine una corta)',
      'Presentar la placa',
    ],
    esperado: 'NEGADO; la barrera NO se mueve; el motivo distingue vencida de desconocida',
    motivo: 'VIGENCIA_EXPIRADA',
    umbral: 'decisión < 3 000 ms',
  },
  {
    id: 'L4',
    familia: 'camara',
    titulo: 'Placa en lista negra CON autorización vigente',
    criterios: 'CA-13 · RN-06 · CA-18 · KPI-25',
    pasos: [
      'Con una autorización vigente para la placa, añadirla a la lista negra desde la consola',
      'Presentar la placa; cronometrar la alerta en la consola de guardia',
    ],
    esperado:
      'NEGADO por precedencia de la lista negra; alerta crítica al operador; la barrera NO abre',
    motivo: 'LISTA_NEGRA (no VIGENCIA_EXPIRADA ni PLACA_DESCONOCIDA)',
    umbral: 'alerta en la consola < 10 000 ms (CA-18)',
  },
  {
    id: 'L5',
    familia: 'camara',
    titulo: 'Lectura de baja confianza y apertura manual con motivo',
    criterios: 'CU-01 exc. 3a · CA-16 · CA-17 · RN-08 · KPI-32',
    pasos: [
      'Presentar la placa sucia, torcida o a medias para que la confianza baje del umbral (P-02: 80)',
      'En la portería, abrir A MANO escribiendo un motivo; repetir sin motivo',
    ],
    esperado:
      'La cámara NO decide sola: el evento entra en la cola con la evidencia; sin motivo la orden no se ejecuta; con motivo la barrera abre y la orden queda atribuida',
    motivo: 'CONFIANZA_INSUFICIENTE y, después, la orden manual con su motivo en /ordenes',
    umbral: 'orden manual → relé < 3 000 ms (KPI-32)',
  },

  /* ── Terminal facial · 5 ────────────────────────────────────────────── */
  {
    id: 'T1',
    familia: 'terminal',
    titulo: 'Enrolamiento con consentimiento del VISITANTE',
    criterios: 'CU-02 · RN-09 · RN-10 · CA-08 · CA-09 · KPI-16 · KPI-17',
    pasos: [
      'Desde la app del residente, capturar el rostro del visitante (la calidad se valida antes de enviar)',
      'Abrir en el teléfono del visitante el enlace de consentimiento y ACEPTAR',
      'Comprobar en la consola (Biometría → seguimiento) la sincronización y en la terminal el conteo de la biblioteca',
    ],
    esperado:
      'La plantilla se sincroniza sólo DESPUÉS de aceptar; el conteo de la biblioteca sube en uno; antes de aceptar no se sincroniza nada',
    motivo: '— (sincronizada)',
    umbral: 'sincronización < 60 000 ms tras aceptar (KPI-17)',
  },
  {
    id: 'T2',
    familia: 'terminal',
    titulo: 'Reconocimiento con verificación remota y apertura',
    criterios: 'CA-07 · KPI-13 · CA-26 · hito 3 del reto',
    pasos: ['Con T1 hecho y una autorización vigente para el visitante, presentarse a la terminal'],
    esperado:
      'La terminal REPORTA y espera; la API decide PERMITIDO y la terminal abre; evento con la verificación remota anotada',
    motivo: '— (permitido)',
    umbral: '< 3 000 ms del reconocimiento a la apertura (KPI-13)',
  },
  {
    id: 'T3',
    familia: 'terminal',
    titulo: 'Rostro enrolado con autorización vencida o revocada',
    criterios: 'CA-12 · CA-26 · RN-01',
    pasos: ['Revocar la autorización del visitante (o dejar que venza) y presentarse de nuevo'],
    esperado:
      'La terminal NO abre aunque reconozca el rostro: la decisión es de la API (modo evento). Evento NEGADO',
    motivo: 'VIGENCIA_EXPIRADA',
    umbral: 'decisión < 3 000 ms; la puerta no se mueve',
  },
  {
    id: 'T4',
    familia: 'terminal',
    titulo: 'Revocación del consentimiento y supresión inmediata',
    criterios: 'RN-11 · CA-10 · CA-11 · KPI-20 · KPI-21',
    pasos: [
      'Desde el enlace del visitante (o la consola), REVOCAR el consentimiento',
      'Comprobar el conteo de la biblioteca de la terminal y presentarse otra vez',
    ],
    esperado:
      'La plantilla desaparece de la terminal de inmediato (conteo baja en uno); un intento posterior no reconoce a nadie',
    motivo: 'tras la revocación: desconocido / CONFIANZA_INSUFICIENTE',
    umbral: 'retirada de la terminal < 60 000 ms desde la revocación',
  },
  {
    id: 'T5',
    familia: 'terminal',
    titulo: 'Rostro no enrolado',
    criterios: 'CA-07 · RN-02',
    pasos: ['Presentar a la terminal a una persona sin plantilla'],
    esperado:
      'No abre; si la terminal reporta el intento, la API lo registra NEGADO sin identidad; ninguna imagen queda como dato biométrico en la API',
    motivo: 'CONFIANZA_INSUFICIENTE o sin identidad',
    umbral: '—',
  },

  /* ── Videoportero · 6 ───────────────────────────────────────────────── */
  {
    id: 'V1',
    familia: 'videoportero',
    titulo: 'Llamada del videoportero a una vivienda',
    criterios: 'CU-03 · HU-25 · CA-18',
    pasos: ['Marcar en el videoportero el edificio y la unidad de una vivienda del padrón'],
    esperado:
      'Aviso emergente en portería y en guardia virtual con la vivienda resuelta; queda en /eventos como llamada, no como acceso',
    motivo: '— (llamada avisada a las consolas)',
    umbral: 'aviso en la consola < 10 000 ms',
  },
  {
    id: 'V2',
    familia: 'videoportero',
    titulo: 'Audio bidireccional con exclusividad',
    criterios: 'ADR-01 · HU-26 · CA-19 · KPI-33',
    pasos: [
      'Atender la llamada desde la guardia virtual (https o localhost: el micrófono lo exige)',
      'Hablar y escuchar; abrir un segundo operador y pedir el mismo canal',
    ],
    esperado:
      'Se oye y se habla en el formato que el equipo anuncia; el segundo operador queda EN ESPERA con su puesto; al colgar, el canal se cierra en el equipo',
    motivo: '— (canal abierto: transporte equipo)',
    umbral: 'audio extremo a extremo < 2 000 ms (KPI-33), cronómetro en mano',
  },
  {
    id: 'V3',
    familia: 'videoportero',
    titulo: 'Video en vivo por WHEP a través de la API',
    criterios: 'CA-19 · KPI-33 · RN-12 · RN-21',
    pasos: [
      'Con GO2RTC_URL en la API, seleccionar el videoportero en la guardia virtual',
      'Leer en la consola «negociación N ms · primer cuadro M ms»; en las herramientas del navegador, comprobar que ninguna petición lleva rtsp:// ni la dirección del equipo',
    ],
    esperado:
      'Se ve la cámara del videoportero; el navegador sólo habla con /api/ncr; la latencia se muestra en pantalla',
    motivo: '— (en vivo)',
    umbral: 'primer cuadro < 2 000 ms (KPI-33)',
  },
  {
    id: 'V4',
    familia: 'videoportero',
    titulo: 'Apertura remota desde la central con motivo',
    criterios: 'CA-20 · RN-08 · KPI-32 · HU-27',
    pasos: ['Con la llamada atendida, ABRIR desde la consola escribiendo el motivo'],
    esperado:
      'La puerta del videoportero abre; la orden queda atribuida al operador con su motivo; evento de apertura',
    motivo: '— (orden manual: abrir)',
    umbral: 'orden → relé < 3 000 ms (KPI-32)',
  },
  {
    id: 'V5',
    familia: 'videoportero',
    titulo: 'Negación con motivo y aviso al residente',
    criterios: 'CA-17 · RN-08 · HU-28',
    pasos: ['NEGAR desde la consola con motivo; pulsar «Avisar al residente»'],
    esperado:
      'La puerta NO se mueve; la negación queda registrada con motivo; el aviso al residente queda como alerta informativa',
    motivo: '— (orden manual: negar)',
    umbral: '—',
  },
  {
    id: 'V6',
    familia: 'videoportero',
    titulo: 'Operador ocupado en otra copropiedad, escalamiento y emergencia',
    criterios: 'CU-03 flujos alternos · KPI-35 · HU-29 · CA-18 · RN-18',
    pasos: [
      'Con el operador atendiendo la copropiedad A, provocar una llamada en la B',
      'Conmutar a la B; comprobar que nada de la A se ve; pulsar EMERGENCIA con motivo',
    ],
    esperado:
      'La llamada de B espera en cola con su tiempo; al conmutar no aparece ningún dato de A; la emergencia se escala con severidad crítica',
    motivo: '— (alerta: panico, crítica)',
    umbral: 'escalamiento < 10 000 ms (CA-18)',
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
  for (const familia of ['camara', 'terminal', 'videoportero']) {
    const filas = ESCENARIOS.filter((e) => e.familia === familia);
    lineas.push(`## ${ROTULO[familia]} · ${String(filas.length)} escenarios`);
    lineas.push('');
    lineas.push(
      '| # | Escenario | Esperado | Obtenido | Motivo en consola | Latencia (ms) | Evento en /eventos | Evidencia | Veredicto |',
    );
    lineas.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const e of filas) {
      lineas.push(
        `| ${e.id} | ${celda(e.titulo)} | ${celda(e.esperado)} · umbral: ${celda(e.umbral)} | | esperado: ${celda(e.motivo)} | | | | |`,
      );
    }
    lineas.push('');
    for (const e of filas) {
      lineas.push(`### ${e.id} · ${e.titulo}`);
      lineas.push('');
      lineas.push(`- Criterios: ${e.criterios}`);
      lineas.push('- Pasos:');
      e.pasos.forEach((p, i) => lineas.push(`  ${String(i + 1)}. ${p}`));
      lineas.push(`- Esperado: ${e.esperado}`);
      lineas.push(`- Motivo esperado en consola: ${e.motivo}`);
      lineas.push(`- Umbral: ${e.umbral}`);
      lineas.push('');
    }
  }
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
  lineas.push('| Familia | Escenarios | PASA | FALLA | NO EJECUTADO |');
  lineas.push('| --- | --- | --- | --- | --- |');
  for (const familia of ['camara', 'terminal', 'videoportero']) {
    const n = ESCENARIOS.filter((e) => e.familia === familia).length;
    lineas.push(`| ${ROTULO[familia]} | ${String(n)} | | | |`);
  }
  lineas.push(`| **Total** | **${String(ESCENARIOS.length)}** | | | |`);
  lineas.push('');
  lineas.push(
    '**La ETAPA 15 se cierra sólo con los 16 escenarios en PASA**, o con cada FALLA convertida en un defecto con dueño y una nueva ejecución de la hoja.',
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
