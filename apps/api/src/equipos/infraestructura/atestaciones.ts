import type { Pool } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import type {
  AtestacionDelInstalador,
  AtestacionNueva,
  RepositorioDeAtestaciones,
} from '../aplicacion/puertos';
import { conCliente } from '../../persistencia/con-cliente';

interface FilaDeAtestacion {
  readonly id: string;
  readonly dispositivo_id: string;
  readonly firmware: string;
  readonly placa_en_lista_blanca: string;
  readonly placa_desconocida: string;
  readonly evidencia: string;
  readonly registrada_en: Date;
  readonly creado_por: string;
}

const aAtestacion = (f: FilaDeAtestacion): AtestacionDelInstalador => ({
  id: f.id,
  dispositivoId: f.dispositivo_id,
  firmware: f.firmware,
  placaEnListaBlanca: f.placa_en_lista_blanca,
  placaDesconocida: f.placa_desconocida,
  evidencia: f.evidencia,
  registradaEn: f.registrada_en.toISOString(),
  registradaPor: f.creado_por,
});

/**
 * D-11 · con los claims de QUIEN PREGUNTA, en una transacción: la RLS decide
 * (sólo el superadministrador inserta; la administración y el servicio leen)
 * y los claims no quedan pegados a la conexión del pool.
 */
export class RepositorioDeAtestacionesPg implements RepositorioDeAtestaciones {
  constructor(private readonly pool: Pool) {}

  private async enTransaccion<T>(
    ctx: ContextoTenant,
    fn: (consultar: Pool['query']) => Promise<T>,
  ): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({
            rol: ctx.rol,
            usuario_id: ctx.usuarioId,
            copropiedad_id: ctx.copropiedadId,
            copropiedades: ctx.copropiedadesAtendidas,
          }),
        ]);
        const resultado = await fn(cliente.query.bind(cliente) as Pool['query']);
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }

  async registrar(
    ctx: ContextoTenant,
    copropiedadId: string,
    nueva: AtestacionNueva,
  ): Promise<AtestacionDelInstalador> {
    return this.enTransaccion(ctx, async (consultar) => {
      const { rows } = await consultar<FilaDeAtestacion>(
        `INSERT INTO public.atestaciones_de_equipo
           (copropiedad_id, dispositivo_id, firmware, placa_en_lista_blanca,
            placa_desconocida, ninguna_abrio, evidencia, creado_por)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING id, dispositivo_id, firmware, placa_en_lista_blanca, placa_desconocida,
                   evidencia, registrada_en, creado_por`,
        [
          copropiedadId,
          nueva.dispositivoId,
          nueva.firmware,
          nueva.placaEnListaBlanca,
          nueva.placaDesconocida,
          nueva.evidencia,
          nueva.registradaPor,
        ],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('la base no devolvió la atestación insertada');
      return aAtestacion(fila);
    });
  }

  async ultimasPorEquipo(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<ReadonlyMap<string, AtestacionDelInstalador>> {
    return this.enTransaccion(ctx, async (consultar) => {
      const { rows } = await consultar<FilaDeAtestacion>(
        `SELECT DISTINCT ON (dispositivo_id)
                id, dispositivo_id, firmware, placa_en_lista_blanca, placa_desconocida,
                evidencia, registrada_en, creado_por
           FROM public.atestaciones_de_equipo
          WHERE copropiedad_id = $1
          ORDER BY dispositivo_id, registrada_en DESC, id DESC`,
        [copropiedadId],
      );
      return new Map(rows.map((f) => [f.dispositivo_id, aAtestacion(f)]));
    });
  }
}

const aSinCopropiedad = (f: AtestacionDelInstalador): AtestacionDelInstalador => ({
  id: f.id,
  dispositivoId: f.dispositivoId,
  firmware: f.firmware,
  placaEnListaBlanca: f.placaEnListaBlanca,
  placaDesconocida: f.placaDesconocida,
  evidencia: f.evidencia,
  registradaEn: f.registradaEn,
  registradaPor: f.registradaPor,
});

/** El doble sin base. Sólo inserción, como la tabla. */
export class RepositorioDeAtestacionesEnMemoria implements RepositorioDeAtestaciones {
  private readonly filas: (AtestacionDelInstalador & { readonly copropiedadId: string })[] = [];
  private secuencia = 0;

  async registrar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    nueva: AtestacionNueva,
  ): Promise<AtestacionDelInstalador> {
    this.secuencia += 1;
    const fila = {
      ...nueva,
      copropiedadId,
      id: `atestacion-${String(this.secuencia)}`,
      registradaEn: new Date(Date.UTC(2026, 8, 26, 0, 0, this.secuencia)).toISOString(),
    };
    this.filas.push(fila);
    return aSinCopropiedad(fila);
  }

  async ultimasPorEquipo(
    _ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<ReadonlyMap<string, AtestacionDelInstalador>> {
    const ultimas = new Map<string, AtestacionDelInstalador>();
    for (const fila of this.filas) {
      if (fila.copropiedadId === copropiedadId)
        ultimas.set(fila.dispositivoId, aSinCopropiedad(fila));
    }
    return ultimas;
  }
}
