import type { Pool, PoolClient } from 'pg';
import { Injectable } from '@nestjs/common';
import type { Acceso, FiltroDeEventos, MotivoAcceso, TipoDeEvento } from '@ncr/domain-core';
import type {
  EventoRegistrado,
  PaginaDeEventos,
  RepositorioEventos,
  ResultadoAnexado,
} from '../aplicacion/puertos';
import { cursorDe, leerCursor } from './proyeccion-eventos';

/**
 * El dominio dice `facial` y `tarjeta`; el enumerado `metodo_identificacion` de
 * la migración 0002 dice `rostro` y `credencial`.
 *
 * La traducción vive AQUÍ y en ningún otro sitio. Renombrar el enumerado para
 * que coincidiera habría sido cambiar el esquema por comodidad del adaptador;
 * usar el vocabulario de la base en el dominio habría metido un detalle de
 * persistencia en el lenguaje ubicuo. Un mapa de cinco entradas en la frontera
 * es exactamente el trabajo que le toca a la capa de infraestructura.
 */
const A_BASE: Readonly<Record<string, string>> = {
  placa: 'placa',
  facial: 'rostro',
  tarjeta: 'credencial',
  manual: 'manual',
  remoto: 'remoto',
};
const DESDE_BASE: Readonly<Record<string, string>> = {
  placa: 'placa',
  rostro: 'facial',
  credencial: 'tarjeta',
  manual: 'manual',
  remoto: 'remoto',
};

interface FilaEvento {
  id: string;
  copropiedad_id: string;
  ocurrido_en: Date;
  tipo: string;
  resultado: string;
  motivo: string | null;
  metodo: string;
  persona_id: string | null;
  vivienda_id: string | null;
  zona_id: string | null;
  dispositivo_id: string;
  placa_detectada: string | null;
  confianza: string | null;
  regla_aplicada: string;
  version_reglas: string;
  operador_id: string | null;
  motivo_manual: string | null;
  evidencia_id: string | null;
  decidido_por_edge: boolean;
}

/**
 * Adaptador PostgreSQL del histórico de eventos — RN-02, RN-03, RN-17, CA-22.
 *
 * **`anexar` no consulta antes de insertar.** La deduplicación la resuelve la
 * clave primaria de `recepciones_evento` en la misma sentencia que inserta
 * (ADR-04): un `SELECT`-luego-`INSERT` es correcto en pruebas secuenciales y
 * falso bajo concurrencia, y aquí la concurrencia es el caso normal — el Edge
 * reintenta en ráfaga al recuperar la WAN.
 *
 * **La recepción se escribe ANTES que el evento.** Es lo que permite descartar
 * un duplicado sin haber tocado `eventos`, que es append-only y donde deshacer
 * una inserción exigiría un borrado que la base no concede a nadie (ADR-005).
 * La clave ajena es `DEFERRABLE INITIALLY DEFERRED` precisamente para permitir
 * este orden.
 *
 * **No existe `actualizar` ni `borrar`, y no es un olvido.** El puerto tampoco
 * los declara: RN-03 se lee en el tipo antes que en los permisos.
 */
@Injectable()
export class RepositorioEventosPg implements RepositorioEventos {
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown>,
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  async anexar(acceso: Acceso, actorId: string): Promise<ResultadoAnexado> {
    return this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        const reserva = await c.query<{ evento_id: string }>(
          `INSERT INTO public.recepciones_evento
             (copropiedad_id, clave_idempotencia, evento_id, evento_ocurrido_en, origen, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING
           RETURNING evento_id`,
          [
            acceso.copropiedadId,
            acceso.claveIdempotencia,
            acceso.id,
            acceso.ocurridoEn,
            acceso.metodo,
            actorId,
          ],
        );

        if (reserva.rowCount === 0) {
          // CA-22 · ya se recibió. Se devuelve el identificador del PRIMERO,
          // no un error: el emisor reintenta por diseño y un 409 le haría
          // reintentar otra vez.
          const previo = await c.query<{ evento_id: string }>(
            `SELECT evento_id FROM public.recepciones_evento
              WHERE copropiedad_id=$1 AND clave_idempotencia=$2`,
            [acceso.copropiedadId, acceso.claveIdempotencia],
          );
          await c.query('ROLLBACK');
          return { tipo: 'duplicado', id: previo.rows[0]?.evento_id ?? acceso.id } as const;
        }

        await c.query(
          `INSERT INTO public.eventos
             (id, copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
              persona_id, vivienda_id, autorizacion_id, zona_id, dispositivo_id,
              placa_detectada, confianza, regla_aplicada, version_reglas,
              decidido_por_edge, cache_potencialmente_obsoleto,
              operador_id, motivo_manual, evidencia_id, clave_idempotencia, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            acceso.id,
            acceso.copropiedadId,
            acceso.ocurridoEn,
            acceso.tipo,
            acceso.resultado,
            acceso.motivo,
            A_BASE[acceso.metodo] ?? 'manual',
            acceso.personaId,
            acceso.viviendaId,
            acceso.autorizacionId,
            acceso.zonaId,
            acceso.dispositivoId,
            acceso.placaDetectada,
            acceso.confianza,
            acceso.reglaAplicada,
            acceso.versionDeReglas.numero,
            acceso.decididoPorEdge,
            acceso.cachePotencialmenteObsoleto,
            acceso.operadorId,
            acceso.motivoManual,
            acceso.evidenciaId,
            acceso.claveIdempotencia,
            actorId,
          ],
        );
        await c.query('COMMIT');
        return { tipo: 'anexado', id: acceso.id } as const;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  }

  async consultar(filtro: FiltroDeEventos): Promise<PaginaDeEventos> {
    const cursor = filtro.cursor === null ? null : leerCursor(filtro.cursor);
    const parametros: unknown[] = [filtro.copropiedadId, filtro.desde, filtro.hasta];
    const condiciones = [
      'copropiedad_id = $1',
      'ocurrido_en >= $2',
      'ocurrido_en < $3',
      ...opcional('vivienda_id', filtro.viviendaId, parametros),
      ...opcional('persona_id', filtro.personaId, parametros),
      ...opcional('dispositivo_id', filtro.dispositivoId, parametros),
      ...opcional('zona_id', filtro.zonaId, parametros),
      ...opcional('tipo', filtro.tipo, parametros),
      ...opcional('resultado', filtro.resultado, parametros),
      ...opcional('motivo', filtro.motivo, parametros),
    ];

    if (cursor !== null) {
      // Conjunto de claves, no desplazamiento: la tabla crece por la cabecera y
      // un OFFSET saltaría las filas que entraron entre página y página.
      parametros.push(cursor.ocurridoEn, cursor.id);
      condiciones.push(`(ocurrido_en, id) < ($${parametros.length - 1}, $${parametros.length})`);
    }

    // `tamanoPagina + 1` para saber si hay página siguiente sin un `count(*)`,
    // que sobre una tabla particionada recorrería todas las particiones.
    parametros.push(filtro.tamanoPagina + 1);

    const { rows } = await this.conContexto((c) =>
      c.query<FilaEvento>(
        `SELECT id, copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                persona_id, vivienda_id, zona_id, dispositivo_id, placa_detectada,
                confianza, regla_aplicada, version_reglas, operador_id, motivo_manual,
                evidencia_id, decidido_por_edge
           FROM public.eventos
          WHERE ${condiciones.join(' AND ')}
          ORDER BY ocurrido_en DESC, id DESC
          LIMIT $${parametros.length}`,
        parametros,
      ),
    );

    const hayMas = rows.length > filtro.tamanoPagina;
    const filas = rows.slice(0, filtro.tamanoPagina).map(mapearFila);
    const ultima = filas[filas.length - 1];
    return { filas, siguiente: hayMas && ultima !== undefined ? cursorDe(ultima) : null };
  }

  async porId(copropiedadId: string, eventoId: string): Promise<EventoRegistrado | null> {
    const { rows } = await this.conContexto((c) =>
      c.query<FilaEvento>(
        `SELECT id, copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                persona_id, vivienda_id, zona_id, dispositivo_id, placa_detectada,
                confianza, regla_aplicada, version_reglas, operador_id, motivo_manual,
                evidencia_id, decidido_por_edge
           FROM public.eventos WHERE copropiedad_id=$1 AND id=$2`,
        [copropiedadId, eventoId],
      ),
    );
    const fila = rows[0];
    return fila === undefined ? null : mapearFila(fila);
  }
}

/** Añade la condición solo si el filtro la trae; acumula el parámetro. */
const opcional = (columna: string, valor: unknown, parametros: unknown[]): string[] => {
  if (valor === null || valor === undefined) return [];
  parametros.push(valor);
  return [`${columna} = $${parametros.length}`];
};

const mapearFila = (f: FilaEvento): EventoRegistrado => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  ocurridoEn: f.ocurrido_en,
  tipo: f.tipo as TipoDeEvento,
  resultado: f.resultado as 'permitido' | 'negado',
  motivo: f.motivo as MotivoAcceso | null,
  metodo: DESDE_BASE[f.metodo] ?? f.metodo,
  personaId: f.persona_id,
  viviendaId: f.vivienda_id,
  zonaId: f.zona_id,
  dispositivoId: f.dispositivo_id,
  placaDetectada: f.placa_detectada,
  // `numeric` llega como cadena desde `pg`: convertirlo aquí evita que la
  // comparación `confianza < umbral` se haga entre cadenas en algún consumidor.
  confianza: f.confianza === null ? null : Number(f.confianza),
  reglaAplicada: f.regla_aplicada,
  versionReglas: Number(f.version_reglas),
  operadorId: f.operador_id,
  motivoManual: f.motivo_manual,
  evidenciaId: f.evidencia_id,
  decididoPorEdge: f.decidido_por_edge,
});
