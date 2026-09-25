import type { DiagnosticoDeEquipo } from './diagnostico-de-equipo';
import type { ClaseDeCorreccion } from './correcciones';
import { IMAGENES } from '../camara/receptor-en-el-equipo';
import type { CapacidadesDeEquipo, EstadoDeCapacidad } from '../nucleo/capacidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL DIAGNÓSTICO, EN LA FORMA QUE UNA PANTALLA PUEDE PINTAR
 *
 * El diagnóstico devuelve seis veredictos con estructuras distintas, cada una
 * fiel a lo que el equipo declara. Eso está bien para razonar y mal para
 * pintar: la consola acabaría con seis bloques que se parecen y no se parecen,
 * y cada uno con su forma de decir «esto está mal».
 *
 * Aquí se aplana a **una lista de hallazgos con el mismo tipo**: qué campo, en
 * qué estado, qué se leyó, qué debería decir, y si hay un botón que lo arregle.
 * La consola pinta una lista; la traducción vive donde vive el vocabulario.
 *
 * **`no_comprobado` no es `conforme`.** Es el estado que esta lista existe para
 * no perder: una consulta que el equipo no contestó deja el campo en blanco, y
 * un blanco que se pinta igual que un verde es exactamente el falso verde que
 * este proyecto persigue.
 */

export type EstadoDeHallazgo = 'conforme' | 'aviso' | 'bloqueo' | 'no_comprobado';

export interface HallazgoDelEquipo {
  /** En lenguaje del operador. Nunca el nombre del campo del fabricante. */
  readonly campo: string;
  readonly estado: EstadoDeHallazgo;
  readonly valorLeido: string | null;
  /** Qué debería decir. `null` cuando depende de la instalación. */
  readonly valorCorrecto: string | null;
  readonly detalle: string;
  /** Qué corrección lo arregla desde la consola. `null` si no la hay. */
  readonly correccion: ClaseDeCorreccion | null;
}

export interface FichaDelEquipo {
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly serie: string | null;
  readonly horaDelEquipo: string | null;
  readonly desvioDeRelojSegundos: number | null;
  readonly hallazgos: readonly HallazgoDelEquipo[];
  /** Consultas que no contestaron, con el motivo. Se enseñan. */
  readonly sinComprobar: readonly string[];
}

const noComprobado = (campo: string, detalle: string): HallazgoDelEquipo => ({
  campo,
  estado: 'no_comprobado',
  valorLeido: null,
  valorCorrecto: null,
  detalle,
  correccion: null,
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FICHA ES POLIMÓRFICA · O4
 *
 * Hasta la 15-C toda ficha tenía las seis secciones de la cámara: una terminal
 * facial salía con «quién decide la apertura: no se pudo leer», «país del
 * algoritmo: sin comprobar»… cinco hallazgos que no le aplican, y NINGUNO de
 * los que sí: si espera el veredicto de la plataforma, si su biblioteca cabe,
 * si abre desde aquí. Eso es un diagnóstico de cámara aplicado a lo que no lo
 * es, y se leía como un equipo a medio comprobar.
 *
 * Ahora la familia decide las secciones. Las de la terminal y el videoportero
 * salen de las CAPACIDADES NEUTRALES (O2) — el mismo vocabulario que mira el
 * proveedor antes de pedir algo—, así que lo que la ficha dice y lo que el
 * sistema hará después no pueden discrepar.
 */
const desdeCapacidad = (
  campo: string,
  estado: EstadoDeCapacidad,
  textos: {
    readonly si: { readonly valor: string; readonly detalle: string };
    readonly no: { readonly estado: 'aviso' | 'bloqueo'; readonly detalle: string };
    readonly desconocida: string;
    readonly valorCorrecto: string;
  },
): HallazgoDelEquipo =>
  estado === 'si'
    ? {
        campo,
        estado: 'conforme',
        valorLeido: textos.si.valor,
        valorCorrecto: textos.valorCorrecto,
        detalle: textos.si.detalle,
        correccion: null,
      }
    : estado === 'no'
      ? {
          campo,
          estado: textos.no.estado,
          valorLeido: 'no',
          valorCorrecto: textos.valorCorrecto,
          detalle: textos.no.detalle,
          correccion: null,
        }
      : noComprobado(campo, textos.desconocida);

const hallazgosDeTerminal = (c: CapacidadesDeEquipo): HallazgoDelEquipo[] => {
  const biblioteca = c.bibliotecaDeRostros;
  const ocupacion =
    biblioteca.maximo !== null && biblioteca.almacenadas !== null && biblioteca.maximo > 0
      ? biblioteca.almacenadas / biblioteca.maximo
      : null;
  return [
    {
      ...desdeCapacidad('quién decide la apertura', c.verificacionRemota, {
        si: {
          valor: 'reporta y espera el veredicto',
          detalle:
            'La terminal reconoce, REPORTA y espera a que la plataforma decida. Es lo que ' +
            '«Next Control decide, el hardware ejecuta» exige de este equipo',
        },
        no: {
          estado: 'bloqueo',
          detalle:
            'La terminal decide por su cuenta: reconoce y abre sin preguntar. El motor de reglas ' +
            'quedaría decorativo y la traza, incompleta. Actívele la verificación remota desde ' +
            'aquí (cambia quién decide: exige confirmación y queda en auditoría) o en el propio ' +
            'equipo; si el modelo no la admite, es un hallazgo de BLOQUEO y el equipo no se opera',
        },
        desconocida:
          'No se pudo leer si la terminal espera el veredicto de la plataforma. Sin eso no se ' +
          'puede afirmar que no decida sola',
        valorCorrecto: 'reporta y espera el veredicto',
      }),
      // A2 · la corrección existe desde la consola SÓLO cuando el equipo dijo
      // «no»: con `desconocida` no hay documento que leer-modificar-escribir.
      correccion: c.verificacionRemota === 'no' ? 'verificacion_remota' : null,
    },
    biblioteca.estado === 'si'
      ? {
          campo: 'biblioteca de rostros',
          estado: ocupacion !== null && ocupacion >= 0.9 ? 'aviso' : 'conforme',
          valorLeido:
            biblioteca.almacenadas === null || biblioteca.maximo === null
              ? 'declarada'
              : `${String(biblioteca.almacenadas)} de ${String(biblioteca.maximo)} plantillas`,
          valorCorrecto: 'con espacio para las plantillas vigentes',
          detalle:
            ocupacion !== null && ocupacion >= 0.9
              ? 'La biblioteca está al 90 % o más: la siguiente sincronización puede fallar por ' +
                'falta de espacio. Suprima las plantillas vencidas antes'
              : 'La terminal admite plantillas y tiene espacio',
          correccion: null,
        }
      : desdeCapacidad('biblioteca de rostros', biblioteca.estado, {
          si: { valor: 'declarada', detalle: 'La terminal admite plantillas' },
          no: {
            estado: 'bloqueo',
            detalle:
              'La terminal no declara biblioteca de rostros: no se le puede sincronizar ' +
              'ninguna plantilla y no reconocerá a nadie',
          },
          desconocida: 'No se pudo leer si la terminal admite plantillas ni cuántas',
          valorCorrecto: 'con espacio para las plantillas vigentes',
        }),
    desdeCapacidad('gestión de personas', c.gestionDePersonas, {
      si: { valor: 'sí', detalle: 'La terminal admite dar de alta y de baja personas' },
      no: {
        estado: 'bloqueo',
        detalle: 'Sin gestión de personas no hay a quién asociar una plantilla',
      },
      desconocida: 'No se pudo leer si la terminal admite gestionar personas',
      valorCorrecto: 'sí',
    }),
    desdeCapacidad('apertura desde la plataforma', c.aperturaRemota, {
      si: { valor: 'sí', detalle: 'La puerta admite la orden de apertura desde la plataforma' },
      no: {
        estado: 'bloqueo',
        detalle:
          'La puerta no admite abrirse desde la plataforma: el veredicto favorable no podría ' +
          'ejecutarse',
      },
      desconocida: 'No se pudo leer qué órdenes admite la puerta desde la plataforma',
      valorCorrecto: 'sí',
    }),
  ];
};

const hallazgosDeVideoportero = (c: CapacidadesDeEquipo): HallazgoDelEquipo[] => [
  desdeCapacidad('apertura desde la plataforma', c.aperturaRemota, {
    si: {
      valor: 'sí',
      detalle: 'La central puede abrir la puerta desde la consola (KPI-32)',
    },
    no: {
      estado: 'bloqueo',
      detalle:
        'El videoportero no admite la apertura remota: la guardia virtual no podría abrir y ' +
        'KPI-32 sería imposible con este equipo',
    },
    desconocida: 'No se pudo leer si el videoportero admite la apertura remota',
    valorCorrecto: 'sí',
  }),
  desdeCapacidad('canal de audio bidireccional', c.audioBidireccional.estado, {
    si: {
      valor:
        c.audioBidireccional.canal === null
          ? 'declarado'
          : `canal ${String(c.audioBidireccional.canal)}` +
            (c.audioBidireccional.formato === null ? '' : ` · ${c.audioBidireccional.formato}`),
      detalle:
        'El equipo declara un canal de audio habilitado: la guardia virtual tiene voz (ADR-01)',
    },
    no: {
      estado: 'aviso',
      detalle:
        'Ningún canal de audio habilitado: la guardia virtual verá pero no hablará. Habilítelo en ' +
        'el equipo y vuelva a sondear; si el modelo no lo trae, es la contingencia del ADR-01',
    },
    desconocida: 'No se pudo leer si el equipo tiene canales de audio bidireccional',
    valorCorrecto: 'al menos un canal habilitado',
  }),
  desdeCapacidad('señalización de llamada', c.senalizacionDeLlamada, {
    si: {
      valor: 'sí',
      detalle: 'La central puede contestar o rechazar la llamada desde la consola',
    },
    no: {
      estado: 'aviso',
      detalle:
        'El equipo no admite señalizar la llamada: la central no podrá contestarla desde aquí',
    },
    desconocida: 'No se pudo leer si el equipo admite señalizar llamadas',
    valorCorrecto: 'sí',
  }),
  desdeCapacidad('suscripción a eventos', c.suscripcionDeEventos, {
    si: { valor: 'sí', detalle: 'El equipo admite que la plataforma se suscriba a sus eventos' },
    no: {
      estado: 'aviso',
      detalle: 'Sin suscripción, los timbres sólo llegan si el equipo publica o se le escucha',
    },
    desconocida: 'No se pudo leer si el equipo admite suscripciones',
    valorCorrecto: 'sí',
  }),
];

export const fichaDe = (diagnostico: DiagnosticoDeEquipo): FichaDelEquipo => {
  const hallazgos: HallazgoDelEquipo[] = [];

  if (diagnostico.familia === 'terminal' || diagnostico.familia === 'videoportero') {
    const c = diagnostico.capacidadesDelEquipo;
    if (c === null) {
      hallazgos.push(
        noComprobado(
          'lo que el equipo declara poder hacer',
          'No se pudo leer qué admite el equipo. Sin eso la ficha no puede afirmar nada de él',
        ),
      );
    } else {
      hallazgos.push(
        ...(diagnostico.familia === 'terminal'
          ? hallazgosDeTerminal(c)
          : hallazgosDeVideoportero(c)),
      );
    }
    hallazgos.push(hallazgoDelReloj(diagnostico));
    return {
      modelo: diagnostico.modelo,
      firmware: diagnostico.firmware,
      serie: diagnostico.serie,
      horaDelEquipo: diagnostico.hora?.leida ?? null,
      desvioDeRelojSegundos: diagnostico.hora?.desvioSegundos ?? null,
      hallazgos,
      sinComprobar: diagnostico.sinRespuesta.map((s) => `${s.que}: ${s.motivo}`),
    };
  }

  // ── 1 · Quién decide, por las tres vías ────────────────────────────────────
  const control = diagnostico.control;
  if (control === null) {
    hallazgos.push(
      noComprobado(
        'quién decide la apertura',
        'No se pudo leer la configuración del equipo. Sin eso no se puede afirmar que decida ' +
          'la plataforma, y este sistema no opera sobre una suposición',
      ),
    );
  } else {
    for (const bloqueo of control.bloqueos) {
      hallazgos.push({
        campo: `quién decide · ${bloqueo.campo}`,
        estado: 'bloqueo',
        valorLeido: bloqueo.valorLeido,
        valorCorrecto: bloqueo.valorCorrecto,
        detalle: bloqueo.detalle,
        correccion: bloqueo.campo === 'modo de control' ? 'modo_de_control' : null,
      });
    }
    for (const aviso of control.avisos) {
      hallazgos.push({
        campo: `comportamiento del brazo · ${aviso.campo}`,
        estado: 'aviso',
        valorLeido: aviso.valorLeido,
        valorCorrecto: aviso.valorCorrecto,
        detalle: aviso.detalle,
        correccion: null,
      });
    }
    if (control.bloqueos.length === 0) {
      hallazgos.push({
        campo: 'quién decide la apertura',
        estado: 'conforme',
        valorLeido: control.modo.valorLeido,
        valorCorrecto: '1',
        detalle: control.detalle,
        correccion: null,
      });
    }
    if (control.releQueAbre !== null) {
      hallazgos.push({
        campo: 'relé que abre la barrera',
        estado: 'conforme',
        valorLeido: String(control.releQueAbre),
        valorCorrecto: null,
        detalle:
          'Leído del equipo, no supuesto: accionar otro encendería algo distinto mientras el ' +
          'brazo sigue abajo, y el sistema informaría de que abrió',
        correccion: null,
      });
    }
  }

  // ── 2 · La tercera vía, que ninguna comprobación anterior veía ────────────
  const disparador = diagnostico.disparador;
  if (disparador === null) {
    hallazgos.push(
      noComprobado(
        'disparadores vinculados',
        'No se pudo leer el disparador de detección: no se puede descartar que una acción ' +
          'vinculada accione la barrera por su cuenta',
      ),
    );
  } else {
    hallazgos.push({
      campo: 'disparadores vinculados',
      estado: disparador.abrePorSuCuenta
        ? 'bloqueo'
        : disparador.leido
          ? 'conforme'
          : 'no_comprobado',
      valorLeido: disparador.accionesDeSalida.map((a) => a.puertoIO ?? '?').join(', ') || null,
      valorCorrecto: 'ninguna acción de salida física',
      detalle: disparador.detalle,
      correccion: null,
    });
  }

  // ── 3 · El país del algoritmo ─────────────────────────────────────────────
  const pais = diagnostico.pais;
  if (pais === null) {
    hallazgos.push(
      noComprobado(
        'país del algoritmo',
        'No se pudo leer con qué gramática de placa lee el equipo. Una lectura equivocada ' +
          'parece un problema de enfoque o de luz',
      ),
    );
  } else {
    hallazgos.push({
      campo: 'país del algoritmo',
      estado: pais.clase === 'correcto' ? 'conforme' : 'aviso',
      valorLeido: pais.indiceLeido === null ? null : String(pais.indiceLeido),
      valorCorrecto: String(pais.indiceEsperado),
      detalle: pais.detalle,
      correccion: pais.corregible ? 'pais_del_algoritmo' : null,
    });
  }

  // ── 4 · Qué imágenes envía, y en qué formato ──────────────────────────────
  const receptor = diagnostico.receptor;
  if (receptor === null) {
    hallazgos.push(
      noComprobado(
        'a dónde publica el equipo',
        'No se pudo leer su configuración de notificación: no se sabe si publica en nuestro ' +
          'receptor, en qué formato, ni si envía rostros',
      ),
    );
  } else {
    for (const bloqueo of receptor.bloqueos) {
      hallazgos.push({
        campo: bloqueo.campo,
        estado: 'bloqueo',
        valorLeido: bloqueo.valorLeido,
        valorCorrecto: bloqueo.valorCorrecto,
        detalle: bloqueo.detalle,
        correccion: /formato/i.test(bloqueo.campo) ? 'formato_del_receptor' : null,
      });
    }
    for (const aviso of receptor.avisos) {
      hallazgos.push({
        campo: aviso.campo,
        estado: 'aviso',
        valorLeido: aviso.valorLeido,
        valorCorrecto: aviso.valorCorrecto,
        detalle: aviso.detalle,
        correccion: /imágenes|imagenes/i.test(aviso.campo) ? 'imagenes_del_receptor' : null,
      });
    }
    if (receptor.bloqueos.length === 0 && receptor.avisos.length === 0) {
      hallazgos.push({
        campo: 'a dónde publica el equipo',
        estado: receptor.receptores.length === 0 ? 'aviso' : 'conforme',
        valorLeido: receptor.receptores[0]?.imagenes ?? null,
        valorCorrecto: IMAGENES.soloDeteccion,
        detalle: receptor.detalle,
        correccion: receptor.receptores.length === 0 ? null : null,
      });
    }
  }

  // ── 5 · ¿Es esto una cámara de placa? ─────────────────────────────────────
  const capacidades = diagnostico.capacidades;
  if (capacidades !== null) {
    hallazgos.push({
      campo: 'reconocimiento de matrícula',
      estado: capacidades.admite ? 'conforme' : 'bloqueo',
      valorLeido: capacidades.senales.map((s) => s.campo).join(', ') || null,
      valorCorrecto: 'al menos una señal de capacidad',
      detalle: capacidades.detalle,
      correccion: null,
    });
  }

  // ── 6 · El reloj, invisible hasta que corrompe la trazabilidad ────────────
  hallazgos.push(hallazgoDelReloj(diagnostico));

  if (diagnostico.reportaEstadoDeBarrera === false) {
    hallazgos.push({
      campo: 'estado de la barrera',
      estado: 'aviso',
      valorLeido: 'no soportado',
      valorCorrecto: null,
      detalle:
        'Este modelo no informa de la posición del brazo. La consola no lo sondeará: hacerlo ' +
        'mostraría un estado desconocido permanente que parece una avería',
      correccion: null,
    });
  }

  return {
    modelo: diagnostico.modelo,
    firmware: diagnostico.firmware,
    serie: diagnostico.serie,
    horaDelEquipo: diagnostico.hora?.leida ?? null,
    desvioDeRelojSegundos: diagnostico.hora?.desvioSegundos ?? null,
    hallazgos,
    sinComprobar: diagnostico.sinRespuesta.map((s) => `${s.que}: ${s.motivo}`),
  };
};

/** El reloj se juzga igual en las tres familias. */
const hallazgoDelReloj = (diagnostico: DiagnosticoDeEquipo): HallazgoDelEquipo => {
  const hora = diagnostico.hora;
  if (hora === null) {
    return noComprobado(
      'reloj del equipo',
      'No se pudo leer su hora. Un reloj desviado no produce errores: fecha mal los eventos',
    );
  }
  return {
    campo: 'reloj del equipo',
    estado: hora.excesiva ? 'aviso' : hora.desvioSegundos === null ? 'no_comprobado' : 'conforme',
    valorLeido: hora.leida,
    valorCorrecto: 'la hora del servidor, con desplazamiento horario',
    detalle: hora.detalle,
    correccion: null,
  };
};
