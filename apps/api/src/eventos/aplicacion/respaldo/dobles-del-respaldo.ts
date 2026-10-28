import type { CorreoAEnviar, CorreoSaliente, ResultadoDeCorreo } from '@ncr/domain-core';
import { filtrarYPaginar } from '../../infraestructura/proyeccion-eventos';
import {
  AlmacenDeRespaldosEnMemoria,
  DestinatariosSinBase,
  EnviosDeRespaldoEnMemoria,
  RepositorioDeRespaldosEnMemoria,
} from '../../infraestructura/respaldo-en-memoria';
import { bitacoraDePrueba, relojFijo } from '../dobles';
import type { IdsPorResolver, ResolutorDeNombres } from '../nombres-de-eventos';
import type { EventoRegistrado, RepositorioEventos } from '../puertos';
import { EnviarRespaldos } from './enviar-respaldos';
import { GenerarRespaldo } from './generar-respaldo';
import type { Destinatario, FilaDelRespaldo, FormatoDelRespaldo } from './puertos';
import { RespaldarEventos } from './respaldar-eventos';

/**
 * Dobles de las pruebas del respaldo diario (D-147). Viven en `src/` por lo
 * mismo que `../dobles.ts`: los comparten varias pruebas y nada de producción
 * los importa.
 */
export const COP1 = '10000000-0000-4000-8000-000000000001';
export const COP2 = '10000000-0000-4000-8000-000000000002';
export const ACTOR = '00000000-0000-4000-8000-000000000003';
export const EQUIPO = '90000000-0000-4000-8000-000000000001';
export const SUPER1: Destinatario = {
  id: '00000000-0000-4000-8000-000000000001',
  correo: 'uno@ejemplo.test',
};
export const SUPER2: Destinatario = {
  id: '00000000-0000-4000-8000-000000000002',
  correo: 'dos@ejemplo.test',
};

/** 28/10/2026 a las 00:15 de Bogotá (05:15 UTC): la hora del trabajo. */
export const HORA_DEL_TRABAJO = new Date(Date.UTC(2026, 9, 28, 5, 15));

let secuencia = 0;
export const acceso = (
  ocurridoEn: Date,
  extra: Partial<EventoRegistrado> = {},
): EventoRegistrado => ({
  id: `acc-${String((secuencia += 1)).padStart(6, '0')}`,
  copropiedadId: COP1,
  ocurridoEn,
  tipo: 'ingreso',
  resultado: 'permitido',
  motivo: null,
  metodo: 'placa',
  personaId: null,
  viviendaId: null,
  zonaId: null,
  dispositivoId: EQUIPO,
  placaDetectada: 'ABC123',
  confianza: 0.9,
  reglaAplicada: 'x',
  versionReglas: 1,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: false,
  ...extra,
});

/** Sólo lectura: `anexar` lanza, porque el respaldo nunca escribe en `eventos` (RN-03). */
export const eventosDeSoloLectura = (
  filas: readonly EventoRegistrado[],
): RepositorioEventos & { consultas: number } => {
  const repo = {
    consultas: 0,
    anexar: async () => {
      throw new Error('el respaldo no escribe en eventos');
    },
    consultar: async (filtro: Parameters<RepositorioEventos['consultar']>[0]) => {
      repo.consultas += 1;
      return filtrarYPaginar(filas, filtro);
    },
    porId: async () => null,
  };
  return repo;
};

export const nombresFijos = (): ResolutorDeNombres & { llamadas: IdsPorResolver[] } => {
  const llamadas: IdsPorResolver[] = [];
  return {
    llamadas,
    resolver: async (_c, ids) => {
      llamadas.push(ids);
      return {
        personas: new Map(),
        viviendas: new Map(),
        operadores: new Map(),
        dispositivos: new Map([[EQUIPO, 'Talanquera norte']]),
      };
    },
  };
};

/** Serializa a JSON: basta para comprobar qué filas, en qué orden, y la huella. */
export const formatoJson = (): FormatoDelRespaldo & {
  veces: number;
  ultimas: FilaDelRespaldo[];
} => {
  const formato = {
    veces: 0,
    ultimas: [] as FilaDelRespaldo[],
    serializar: (filas: readonly FilaDelRespaldo[]): Uint8Array => {
      formato.veces += 1;
      formato.ultimas = [...filas];
      return new TextEncoder().encode(JSON.stringify(filas));
    },
  };
  return formato;
};

/** Un SMTP de mentira que responde lo que se le diga, en orden. */
export const correoDePrueba = (
  respuestas: ResultadoDeCorreo[] = [],
): CorreoSaliente & { enviados: CorreoAEnviar[] } => {
  const enviados: CorreoAEnviar[] = [];
  return {
    configurado: true,
    enviados,
    enviar: async (correo) => {
      enviados.push(correo);
      return respuestas.shift() ?? { estado: 'enviado', rechazados: [] };
    },
  };
};

export const montar = (opciones: {
  readonly eventos?: readonly EventoRegistrado[];
  readonly correo?: CorreoSaliente;
  readonly destinatarios?: readonly Destinatario[];
  readonly ahora?: Date;
}) => {
  const reloj = relojFijo(opciones.ahora ?? HORA_DEL_TRABAJO);
  const respaldos = new RepositorioDeRespaldosEnMemoria(() => reloj.ahora());
  const envios = new EnviosDeRespaldoEnMemoria(respaldos, () => reloj.ahora());
  const almacen = new AlmacenDeRespaldosEnMemoria();
  const eventos = eventosDeSoloLectura(opciones.eventos ?? []);
  const nombres = nombresFijos();
  const formato = formatoJson();
  const correo = opciones.correo ?? correoDePrueba();
  const destinatarios = new DestinatariosSinBase(opciones.destinatarios ?? [SUPER1]);
  const bitacora = bitacoraDePrueba();
  const generar = new GenerarRespaldo(eventos, nombres, formato, almacen, respaldos);
  const enviar = new EnviarRespaldos(envios, almacen, destinatarios, correo, reloj);
  const respaldar = new RespaldarEventos(respaldos, generar, enviar, reloj, bitacora);
  return {
    reloj,
    respaldos,
    envios,
    almacen,
    eventos,
    nombres,
    formato,
    correo,
    generar,
    enviar,
    respaldar,
    bitacora,
  };
};
