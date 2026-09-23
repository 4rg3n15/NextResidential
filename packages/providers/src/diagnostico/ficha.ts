import type { DiagnosticoDeEquipo } from './diagnostico-de-equipo';
import type { ClaseDeCorreccion } from './correcciones';
import { IMAGENES } from '../camara/receptor-en-el-equipo';

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

export const fichaDe = (diagnostico: DiagnosticoDeEquipo): FichaDelEquipo => {
  const hallazgos: HallazgoDelEquipo[] = [];

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
  const hora = diagnostico.hora;
  if (hora === null) {
    hallazgos.push(
      noComprobado(
        'reloj del equipo',
        'No se pudo leer su hora. Un reloj desviado no produce errores: fecha mal los eventos',
      ),
    );
  } else {
    hallazgos.push({
      campo: 'reloj del equipo',
      estado: hora.excesiva ? 'aviso' : hora.desvioSegundos === null ? 'no_comprobado' : 'conforme',
      valorLeido: hora.leida,
      valorCorrecto: 'la hora del servidor, con desplazamiento horario',
      detalle: hora.detalle,
      correccion: null,
    });
  }

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
