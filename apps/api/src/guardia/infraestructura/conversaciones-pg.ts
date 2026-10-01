import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  ConversacionTerminada,
  RegistroDeConversaciones,
} from '../aplicacion/conversacion-de-audio';

/**
 * 15-P · P2 · la constancia de cada conversación de la guardia
 * (`conversaciones_de_guardia`, migración 0047): una fila al terminar, como el
 * servicio de la copropiedad, que es el único que puede escribirla. Los tramos
 * son instantes; el audio no viaja hasta aquí.
 */
const segundosDe = (c: ConversacionTerminada): number =>
  Math.round(c.tramos.reduce((s, t) => s + (t.hasta.getTime() - t.desde.getTime()), 0) / 100) / 10;

export class ConversacionesPg implements RegistroDeConversaciones {
  constructor(private readonly pool: Pool) {}

  async registrar(c: ConversacionTerminada): Promise<void> {
    await conCliente(this.pool, async (cliente: PoolClient) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(c.copropiedadId)),
      ]);
      await cliente.query(
        `INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id,
           operador_id, iniciada_en, terminada_en, tramos, segundos_hablados, motivo_de_cierre,
           creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$4)
         ON CONFLICT (id) DO NOTHING`,
        [
          c.id,
          c.copropiedadId,
          c.dispositivoId,
          c.operadorId,
          c.iniciadaEn,
          c.terminadaEn,
          JSON.stringify(c.tramos.map((t) => ({ desde: t.desde, hasta: t.hasta }))),
          segundosDe(c),
          c.motivoDeCierre.slice(0, 200),
        ],
      );
    });
  }
}

/** Sin base (la suite, o un ensayo sin PostgreSQL): en el proceso, y el arranque lo dice. */
export class ConversacionesEnMemoria implements RegistroDeConversaciones {
  readonly registradas: ConversacionTerminada[] = [];

  registrar(c: ConversacionTerminada): Promise<void> {
    this.registradas.push(c);
    return Promise.resolve();
  }
}
