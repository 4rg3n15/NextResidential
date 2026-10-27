import type { FilaDelRespaldo, FormatoDelRespaldo } from '../aplicacion/respaldo/puertos';
import { ZONA_DEL_RESPALDO } from '../aplicacion/respaldo/dias';
import { METODO, MOTIVO } from '../aplicacion/linea-de-tiempo';
import { aExcelCon } from './formatos';

/**
 * D-147 · EL EXCEL DEL RESPALDO DIARIO
 *
 * El mismo serializador de la exportación (`aExcelCon`, SpreadsheetML 2003,
 * sin dependencias) con las columnas del BUSCADOR de la consola (D-145): la
 * hora en Bogotá, el resultado con su motivo en palabras, la persona con su
 * nombre y clase o «Desconocido», la vivienda, la placa, el equipo y el
 * operador. Se añade la hora en UTC, que es la que guarda `eventos`: con ella
 * una fila del respaldo se encuentra en la base sin conversiones.
 */
const NADA = '—';

const HORA_DE_BOGOTA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA_DEL_RESPALDO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const mayuscula = (texto: string): string =>
  texto.length === 0 ? texto : texto[0]!.toUpperCase() + texto.slice(1);

const resultadoDe = (f: FilaDelRespaldo): string => {
  const que = f.resultado === 'permitido' ? 'Permitido' : 'Negado';
  if (f.motivo === null) return que;
  const texto = (MOTIVO as Readonly<Record<string, string>>)[f.motivo] ?? f.motivo;
  return `${que} · ${texto}`;
};

const personaDe = (f: FilaDelRespaldo): string => {
  if (f.persona === null) return 'Desconocido';
  return f.clasePersona === null ? f.persona : `${f.persona} · ${f.clasePersona}`;
};

export const COLUMNAS_DEL_RESPALDO: readonly (readonly [string, (f: FilaDelRespaldo) => string])[] =
  [
    ['Fecha y hora (Bogotá)', (f) => HORA_DE_BOGOTA.format(f.ocurridoEn)],
    ['Tipo', (f) => mayuscula(f.tipo)],
    ['Resultado', resultadoDe],
    ['Método', (f) => mayuscula(METODO[f.metodo] ?? f.metodo)],
    ['Persona', personaDe],
    ['Vivienda', (f) => f.vivienda ?? NADA],
    ['Placa', (f) => f.placa ?? NADA],
    ['Equipo', (f) => f.equipo ?? NADA],
    ['Operador', (f) => f.operador ?? NADA],
    ['Motivo manual', (f) => f.motivoManual ?? ''],
    ['Fecha y hora (UTC)', (f) => f.ocurridoEn.toISOString()],
  ];

export const formatoDelRespaldoEnExcel: FormatoDelRespaldo = {
  serializar: (filas) => aExcelCon(filas, COLUMNAS_DEL_RESPALDO),
};
