import type { Pool, PoolClient } from 'pg';
import { Alerta, esExito } from '@ncr/domain-core';
import type { Bitacora, EstadoDeAlerta, Severidad, TipoDeAlerta } from '@ncr/domain-core';
import type { RepositorioAlertas } from '../aplicacion/puertos';
import { claimsDeServicio } from '../../comun/claims-de-servicio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS ALERTAS EN POSTGRESQL · ETAPA 15-E (D-139)
 *
 * Hasta aquí las alertas vivían en memoria: una lista negra detectada o una
 * emergencia pulsada en la consola desaparecían al reiniciar la API, y la
 * prueba en sitio no dejaba evidencia de CA-18. Este repositorio escribe en la
 * tabla `alertas` con los claims de SERVICIO de la copropiedad de la alerta,
 * igual que el histórico de eventos.
 *
 * Dos particularidades de la tabla, y cómo se atienden aquí:
 *
 *  - Una alerta de EVENTO exige el instante del evento junto al identificador
 *    (`alertas_evento_completo`): el agregado no lo lleva, así que se busca en
 *    `eventos` antes de insertar. Si el evento no está en la base —histórico en
 *    memoria y alertas en base, que es una configuración incoherente y se
 *    avisa—, la alerta se guarda con su origen textual para no perderla.
 *  - Una alerta de CONSOLA (aviso al residente, emergencia) no tiene equipo ni
 *    evento: el agregado la acepta con un marcador en `dispositivoId`. Aquí
 *    ese marcador va a `origen_texto` cuando no es un UUID (migración 0036).
 *
 * La REHIDRATACIÓN pasa por el propio agregado: se abre y se le aplican en
 * orden `escalar`, `atender` y `resolver` con los instantes guardados. No hay
 * un constructor «desde fila» que se salte las invariantes.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilaAlerta {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly tipo: TipoDeAlerta;
  readonly severidad: Severidad;
  readonly estado: EstadoDeAlerta;
  readonly generada_en: Date;
  readonly evento_id: string | null;
  readonly dispositivo_id: string | null;
  readonly origen_texto: string | null;
  readonly escalada_en: Date | null;
  readonly atendida_por: string | null;
  readonly atendida_en: Date | null;
  readonly resuelta_en: Date | null;
  readonly notas: string | null;
}

const CAMPOS = `id, copropiedad_id, tipo, severidad, estado, generada_en, evento_id,
  dispositivo_id, origen_texto, escalada_en, atendida_por, atendida_en, resuelta_en, notas`;

export const rehidratarAlerta = (f: FilaAlerta): Alerta | null => {
  const abierta = Alerta.abrir({
    id: f.id,
    copropiedadId: f.copropiedad_id,
    tipo: f.tipo,
    severidad: f.severidad,
    generadaEn: f.generada_en,
    eventoId: f.evento_id,
    dispositivoId: f.dispositivo_id ?? f.origen_texto,
    notas: f.notas,
  });
  if (!esExito(abierta)) return null;
  let alerta = abierta.valor;
  if (f.escalada_en !== null) alerta = alerta.escalar(f.escalada_en);
  if (f.atendida_por !== null && f.atendida_en !== null) {
    const r = alerta.atender(f.atendida_por, f.atendida_en);
    if (esExito(r)) alerta = r.valor;
  }
  if (f.resuelta_en !== null) {
    const r = alerta.resolver(f.resuelta_en, f.notas ?? 'resuelta');
    if (esExito(r)) alerta = r.valor;
  }
  return alerta;
};

export class RepositorioAlertasPg implements RepositorioAlertas {
  constructor(
    private readonly pool: Pool,
    private readonly bitacora?: Bitacora,
  ) {}

  private async conServicio<T>(
    copropiedadId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  async guardar(alerta: Alerta, actorId: string): Promise<void> {
    await this.conServicio(alerta.copropiedadId, async (c) => {
      let eventoId = alerta.eventoId;
      let ocurridoEn: Date | null = null;
      let origenTexto: string | null = null;
      if (eventoId !== null) {
        const { rows } = await c.query<{ ocurrido_en: Date }>(
          'SELECT ocurrido_en FROM public.eventos WHERE copropiedad_id = $1 AND id = $2 LIMIT 1',
          [alerta.copropiedadId, eventoId],
        );
        ocurridoEn = rows[0]?.ocurrido_en ?? null;
        if (ocurridoEn === null) {
          this.bitacora?.registrar('aviso', 'alerta de un evento que no está en la base', {
            alertaId: alerta.id,
            eventoId,
          });
          origenTexto = `evento:${eventoId}`;
          eventoId = null;
        }
      }
      const dispositivoId =
        alerta.dispositivoId !== null && UUID.test(alerta.dispositivoId)
          ? alerta.dispositivoId
          : null;
      if (dispositivoId === null && alerta.dispositivoId !== null) {
        origenTexto = alerta.dispositivoId.slice(0, 120);
      }
      await c.query(
        `INSERT INTO public.alertas (id, copropiedad_id, tipo, severidad, estado, generada_en,
           evento_id, evento_ocurrido_en, dispositivo_id, origen_texto, escalada_en,
           atendida_por, atendida_en, resuelta_en, notas, creado_por, actualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
         ON CONFLICT (id) DO UPDATE SET
           estado = EXCLUDED.estado, escalada_en = EXCLUDED.escalada_en,
           atendida_por = EXCLUDED.atendida_por, atendida_en = EXCLUDED.atendida_en,
           resuelta_en = EXCLUDED.resuelta_en, notas = EXCLUDED.notas,
           actualizado_por = EXCLUDED.actualizado_por`,
        [
          alerta.id,
          alerta.copropiedadId,
          alerta.tipo,
          alerta.severidad,
          alerta.estado,
          alerta.generadaEn,
          eventoId,
          ocurridoEn,
          dispositivoId,
          origenTexto,
          alerta.escaladaEn,
          alerta.atendidaPor,
          alerta.atendidaEn,
          alerta.resueltaEn,
          alerta.notas,
          actorId,
        ],
      );
    });
  }

  async porId(copropiedadId: string, alertaId: string): Promise<Alerta | null> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<FilaAlerta>(
        `SELECT ${CAMPOS} FROM public.alertas WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, alertaId],
      );
      const fila = rows[0];
      return fila === undefined ? null : rehidratarAlerta(fila);
    });
  }

  async abiertasDe(copropiedadId: string): Promise<readonly Alerta[]> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<FilaAlerta>(
        `SELECT ${CAMPOS} FROM public.alertas
          WHERE copropiedad_id = $1 AND estado <> 'resuelta'
          ORDER BY generada_en DESC LIMIT 200`,
        [copropiedadId],
      );
      return rows.map(rehidratarAlerta).filter((a): a is Alerta => a !== null);
    });
  }
}
