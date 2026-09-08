import type { Pool, PoolClient } from 'pg';
import { Injectable } from '@nestjs/common';
import { Aforo, FranjaHoraria, HorarioDeZona, Zona, esFallo } from '@ncr/domain-core';
import type { PoliticaReinicio, TipoDeZona } from '@ncr/domain-core';
import type { RepositorioZonas, ResultadoOcupacion } from '../aplicacion/puertos';

/**
 * `zona_horarios.dia_semana` es ISO 1..7 (lunes..domingo); el dominio usa
 * 0..6 (domingo..sábado), como `Date.getUTCDay()`. La traducción vive aquí y en
 * ningún otro sitio, igual que `facial`↔`rostro` en el módulo de eventos.
 */
const diaDesdeIso = (iso: number): number => iso % 7;
const diaAIso = (dia: number): number => (dia === 0 ? 7 : dia);

const minutosDeHora = (hora: string): number => {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
};
const horaDeMinutos = (minutos: number): string =>
  minutos >= 1440
    ? '24:00:00'
    : `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00`;

interface FilaZona {
  id: string;
  copropiedad_id: string;
  nombre: string;
  tipo: string;
  abierta: boolean;
  politica_reinicio_aforo: string;
  normas: string[];
  estado: string;
  aforo_maximo: number | null;
  conteo_actual: number | null;
  reiniciado_en: Date | null;
  desplazamiento_utc_minutos: number;
}

interface FilaHorario {
  zona_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  continua_del_dia_anterior: boolean;
}

/**
 * Adaptador PostgreSQL del agregado `Zona` — RN-14, CA-14, CA-15.
 *
 * **Lo que hace a este adaptador el corazón de la etapa es `ocupar`.** No
 * consulta el aforo y luego lo incrementa: lo incrementa **con la condición
 * dentro del `WHERE`**, en una sola sentencia, y lee el veredicto en el número
 * de filas devueltas. Entre comprobar y ocupar no cabe nada, ni siquiera otra
 * petición: es la misma garantía que ADR-04 exige para las placas y que KPI-03
 * midió con 100 inserciones simultáneas.
 *
 * Por debajo, el `CHECK (conteo_actual <= aforo_maximo)` de la migración 0007
 * hace la violación estructuralmente imposible aunque alguien escriba por otra
 * vía. El código no es la garantía: es quien la usa bien.
 */
@Injectable()
export class RepositorioZonasPg implements RepositorioZonas {
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

  // ===========================================================================
  // RN-14 · CA-14 — el incremento atómico
  // ===========================================================================
  async ocupar(copropiedadId: string, zonaId: string): Promise<ResultadoOcupacion> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ conteo_actual: number }>(
        `UPDATE public.zona_aforo
            SET conteo_actual = conteo_actual + 1, actualizado_en = now()
          WHERE copropiedad_id = $1
            AND zona_id = $2
            AND conteo_actual < aforo_maximo
        RETURNING conteo_actual`,
        [copropiedadId, zonaId],
      );

      // UNA fila: la plaza es tuya. CERO filas: o la zona no existe, o está
      // llena. Se distinguen con una consulta que ya no decide nada —solo sirve
      // para el motivo—, así que su resultado no puede reabrir ninguna carrera.
      const fila = rows[0];
      if (fila !== undefined) return { tipo: 'ocupado', conteo: fila.conteo_actual };

      const { rows: estado } = await c.query<{ conteo_actual: number }>(
        'SELECT conteo_actual FROM public.zona_aforo WHERE copropiedad_id=$1 AND zona_id=$2',
        [copropiedadId, zonaId],
      );
      const actual = estado[0];
      return actual === undefined
        ? { tipo: 'zona_no_encontrada' }
        : { tipo: 'aforo_superado', conteo: actual.conteo_actual };
    });
  }

  async liberar(copropiedadId: string, zonaId: string): Promise<number> {
    return this.conContexto(async (c) => {
      // El suelo va en el WHERE, no en el código: una salida sin su entrada
      // —un sensor que falló, CU-05 6a— no puede dejar el contador en negativo.
      const { rows } = await c.query<{ conteo_actual: number }>(
        `UPDATE public.zona_aforo
            SET conteo_actual = conteo_actual - 1, actualizado_en = now()
          WHERE copropiedad_id = $1 AND zona_id = $2 AND conteo_actual > 0
        RETURNING conteo_actual`,
        [copropiedadId, zonaId],
      );
      if (rows[0] !== undefined) return rows[0].conteo_actual;

      const { rows: estado } = await c.query<{ conteo_actual: number }>(
        'SELECT conteo_actual FROM public.zona_aforo WHERE copropiedad_id=$1 AND zona_id=$2',
        [copropiedadId, zonaId],
      );
      return estado[0]?.conteo_actual ?? 0;
    });
  }

  async reiniciar(copropiedadId: string, zonaId: string, ahora: Date): Promise<void> {
    await this.conContexto((c) =>
      c.query(
        `UPDATE public.zona_aforo
            SET conteo_actual = 0, reiniciado_en = $3, actualizado_en = now()
          WHERE copropiedad_id = $1 AND zona_id = $2`,
        [copropiedadId, zonaId, ahora],
      ),
    );
  }

  async porId(copropiedadId: string, zonaId: string): Promise<Zona | null> {
    const zonas = await this.cargar(copropiedadId, zonaId);
    return zonas[0] ?? null;
  }

  async listar(copropiedadId: string): Promise<readonly Zona[]> {
    return this.cargar(copropiedadId, null);
  }

  async guardar(zona: Zona, actorId: string): Promise<void> {
    await this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE public.zonas
              SET nombre=$3, abierta=$4, politica_reinicio_aforo=$5, normas=$6,
                  actualizado_en=now(), actualizado_por=$7
            WHERE copropiedad_id=$1 AND id=$2`,
          [
            zona.copropiedadId,
            zona.id,
            zona.nombre,
            zona.abierta,
            zona.politicaReinicio,
            zona.normas,
            actorId,
          ],
        );
        // El máximo se actualiza; el CONTEO no se toca aquí. Reconfigurar una
        // zona con gente dentro no la vacía, y el único camino que mueve el
        // contador es el atómico.
        await c.query(
          `UPDATE public.zona_aforo SET aforo_maximo=$3, actualizado_en=now()
            WHERE copropiedad_id=$1 AND zona_id=$2`,
          [zona.copropiedadId, zona.id, zona.aforo.maximo],
        );

        await c.query('DELETE FROM public.zona_horarios WHERE copropiedad_id=$1 AND zona_id=$2', [
          zona.copropiedadId,
          zona.id,
        ]);
        for (const f of zona.horario.franjas) {
          await c.query(
            `INSERT INTO public.zona_horarios
               (copropiedad_id, zona_id, dia_semana, hora_inicio, hora_fin,
                continua_del_dia_anterior, creado_por, actualizado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
            [
              zona.copropiedadId,
              zona.id,
              diaAIso(f.dia),
              horaDeMinutos(f.minutoInicio),
              horaDeMinutos(f.minutoFin),
              f.continuaDelDiaAnterior,
              actorId,
            ],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  }

  private async cargar(copropiedadId: string, zonaId: string | null): Promise<Zona[]> {
    return this.conContexto(async (c) => {
      const parametros: unknown[] = [copropiedadId];
      let filtro = 'z.copropiedad_id = $1';
      if (zonaId !== null) {
        parametros.push(zonaId);
        filtro += ' AND z.id = $2';
      }

      const { rows } = await c.query<FilaZona>(
        `SELECT z.id, z.copropiedad_id, z.nombre, z.tipo::text AS tipo, z.abierta,
                z.politica_reinicio_aforo::text AS politica_reinicio_aforo, z.normas,
                z.estado::text AS estado,
                a.aforo_maximo, a.conteo_actual, a.reiniciado_en,
                -- Desplazamiento horario de la copropiedad, EN MINUTOS, resuelto
                -- por la base de datos de zonas horarias de PostgreSQL a partir
                -- del nombre IANA. Se calcula aquí y no en TypeScript para no
                -- tener dos tablas de husos que se separen con los años.
                (EXTRACT(EPOCH FROM (now() AT TIME ZONE cop.zona_horaria))
                 - EXTRACT(EPOCH FROM now()))::int / 60 AS desplazamiento_utc_minutos
           FROM public.zonas z
           JOIN public.copropiedades cop ON cop.id = z.copropiedad_id
           LEFT JOIN public.zona_aforo a
                  ON a.copropiedad_id = z.copropiedad_id AND a.zona_id = z.id
          WHERE ${filtro}
          ORDER BY z.nombre`,
        parametros,
      );
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const { rows: horarios } = await c.query<FilaHorario>(
        `SELECT zona_id, dia_semana, hora_inicio::text, hora_fin::text, continua_del_dia_anterior
           FROM public.zona_horarios
          WHERE copropiedad_id = $1 AND zona_id = ANY($2::uuid[])
          ORDER BY dia_semana, hora_inicio`,
        [copropiedadId, ids],
      );

      // Sin N+1: un `SELECT` para las zonas y otro para todos sus horarios.
      const porZona = new Map<string, FilaHorario[]>();
      for (const h of horarios) {
        const lista = porZona.get(h.zona_id) ?? [];
        lista.push(h);
        porZona.set(h.zona_id, lista);
      }
      return rows.flatMap((fila) => {
        const zona = this.aDominio(fila, porZona.get(fila.id) ?? []);
        return zona === null ? [] : [zona];
      });
    });
  }

  /** Una fila corrupta se DESCARTA con ruido en vez de decidir con ella. */
  private aDominio(fila: FilaZona, horarios: readonly FilaHorario[]): Zona | null {
    const franjas: FranjaHoraria[] = [];
    for (const h of horarios) {
      const f = FranjaHoraria.crear({
        dia: diaDesdeIso(h.dia_semana),
        minutoInicio: minutosDeHora(h.hora_inicio),
        minutoFin: minutosDeHora(h.hora_fin),
        continuaDelDiaAnterior: h.continua_del_dia_anterior,
      });
      if (esFallo(f)) return null;
      franjas.push(f.valor);
    }

    const horario = HorarioDeZona.crear(franjas, fila.desplazamiento_utc_minutos);
    if (esFallo(horario)) return null;

    // Sin fila en `zona_aforo`, el máximo es 0 y la zona queda SIEMPRE llena.
    // Es deliberado: una zona sin aforo configurado es una configuración
    // incompleta, y §2.1.4 manda denegar, no admitir sin límite.
    const aforo = Aforo.crear(fila.aforo_maximo ?? 0, fila.conteo_actual ?? 0);
    if (esFallo(aforo)) return null;

    const zona = Zona.crear({
      id: fila.id,
      copropiedadId: fila.copropiedad_id,
      nombre: fila.nombre,
      tipo: fila.tipo as TipoDeZona,
      horario: horario.valor,
      aforo: aforo.valor,
      politicaReinicio: fila.politica_reinicio_aforo as PoliticaReinicio,
      normas: fila.normas,
      abierta: fila.abierta,
      ultimoReinicio: fila.reiniciado_en,
      activa: fila.estado === 'activo',
    });
    return esFallo(zona) ? null : zona.valor;
  }
}
