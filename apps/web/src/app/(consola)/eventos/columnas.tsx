import type { JSX } from 'react';
import type { ElementoDeLineaDeTiempo } from '@ncr/contracts';
import type { Columna } from '@/componentes/tabla-datos';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { desvioEnPalabras } from '@/lib/fechas';
import { fechaYHoraEnZona } from '@/lib/hora-en-zona';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import { nombreDeMetodo } from './filtros';
import { ORIGEN } from './tipos-de-evento';

/**
 * D-145 · las columnas de la línea de tiempo: cuándo (hora de Bogotá), qué
 * tipo, con qué resultado y motivo, cómo se identificó, quién —con nombre y si
 * es residente o visitante, o «Desconocido»—, qué vivienda, qué placa, qué
 * equipo y, si fue a mano, qué operador.
 *
 * Un evento de equipo no tiene persona, placa ni operador: se deja «—», no
 * «Desconocido», que significa que hubo un acceso y nadie lo identificó.
 */
const tonoDe = (e: ElementoDeLineaDeTiempo): TonoDeDistintivo => {
  if (!e.enVivo) return 'neutro';
  if (e.origen === 'acceso') return e.resultado === 'permitido' ? 'exito' : 'peligro';
  if (/forzada|sabotaje|coaccion|fuera_de_linea|la_camara_decidio|lista_negra/.test(e.tipo)) {
    return 'peligro';
  }
  if (e.origen === 'plataforma') return 'marca';
  return 'aviso';
};

const NADA = '—';

/** El tipo: «Acceso», o lo que dijo el equipo o la plataforma (ya en español). */
const tipoDe = (e: ElementoDeLineaDeTiempo): string =>
  e.origen === 'acceso' ? 'Acceso' : e.titulo;

/** Sólo un acceso tiene resultado: permitido o negado, con su motivo. */
const resultadoDe = (e: ElementoDeLineaDeTiempo): string => {
  if (e.origen !== 'acceso') return NADA;
  const que = e.resultado === 'permitido' ? 'Permitido' : 'Negado';
  return e.motivo === null ? que : `${que} · ${TEXTO_MOTIVO[e.motivo]}`;
};

export const personaDe = (e: ElementoDeLineaDeTiempo): string => {
  if (e.origen !== 'acceso') return NADA;
  if (e.personaId === null) return 'Desconocido';
  const nombre = e.persona ?? 'Persona registrada';
  return e.clasePersona === null ? nombre : `${nombre} · ${e.clasePersona}`;
};

const operadorDe = (e: ElementoDeLineaDeTiempo): string =>
  e.operadorId === null ? NADA : (e.operador ?? 'Operador sin nombre');

const apagado = (texto: string): JSX.Element => (
  <span className="text-secundario text-texto-apagado">{texto}</span>
);

export const columnasDeEventos = (
  nombreDeEquipo: (id: string) => string,
): readonly Columna<ElementoDeLineaDeTiempo>[] => [
  {
    clave: 'momento',
    titulo: 'Fecha y hora',
    texto: (e) => fechaYHoraEnZona(e.ocurridoEn),
    celda: (e) => (
      <span className="tabular-nums text-secundario">
        {fechaYHoraEnZona(e.ocurridoEn)}
        {/* R2 (15-N) · con el reloj del equipo desviado, ésta es la hora de
            RECEPCIÓN; la del equipo se dice, marcada. */}
        {e.relojDesviadoSegundos === null ? null : (
          <span
            className="mt-0.5 block text-distintivo text-aviso-texto"
            title={
              e.horaDelEquipo === null
                ? undefined
                : `El equipo dijo ${fechaYHoraEnZona(e.horaDelEquipo)}`
            }
          >
            Hora de recepción · reloj del equipo {desvioEnPalabras(e.relojDesviadoSegundos)}
          </span>
        )}
      </span>
    ),
  },
  {
    clave: 'tipo',
    titulo: 'Tipo',
    texto: tipoDe,
    celda: (e) =>
      e.origen === 'acceso' ? (
        <span className="text-secundario text-texto">{tipoDe(e)}</span>
      ) : (
        <span className="text-secundario">
          <Distintivo tono={tonoDe(e)}>{tipoDe(e)}</Distintivo>
          <span className="mt-0.5 block text-texto-apagado">{ORIGEN[e.origen]}</span>
        </span>
      ),
  },
  {
    clave: 'resultado',
    titulo: 'Resultado',
    texto: resultadoDe,
    celda: (e) =>
      e.origen === 'acceso' ? (
        <Distintivo tono={tonoDe(e)}>{resultadoDe(e)}</Distintivo>
      ) : (
        apagado(NADA)
      ),
  },
  {
    clave: 'metodo',
    titulo: 'Método',
    texto: (e) => (e.metodo === null ? NADA : nombreDeMetodo(e.metodo)),
    celda: (e) => apagado(e.metodo === null ? NADA : nombreDeMetodo(e.metodo)),
  },
  {
    clave: 'persona',
    titulo: 'Persona',
    texto: personaDe,
    celda: (e) => <span className="text-secundario text-texto">{personaDe(e)}</span>,
  },
  {
    clave: 'vivienda',
    titulo: 'Vivienda',
    texto: (e) => e.vivienda ?? NADA,
    celda: (e) => apagado(e.vivienda ?? NADA),
  },
  {
    clave: 'placa',
    titulo: 'Placa',
    texto: (e) => e.placa ?? NADA,
    celda: (e) => <span className="font-mono text-secundario">{e.placa ?? NADA}</span>,
  },
  {
    clave: 'equipo',
    titulo: 'Equipo',
    texto: (e) => nombreDeEquipo(e.dispositivoId),
    celda: (e) => apagado(nombreDeEquipo(e.dispositivoId)),
  },
  {
    clave: 'operador',
    titulo: 'Operador',
    texto: operadorDe,
    celda: (e) => apagado(operadorDe(e)),
  },
];
