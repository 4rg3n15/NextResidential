import type { AlertasDeEquipo } from '../../eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E6 · P-31 · LA NUBE AVISA CUANDO RECHAZA UN ACCESO DEL EDGE
 *
 * Un acceso que el Edge resolvió durante un corte y la nube NO acepta (placa
 * ilegible, decisión sin motivo) ya ocurrió: la barrera se movió o no. Si la
 * nube sólo lo rechaza, nadie lo ve; el Edge lo reintenta y, al agotar los
 * intentos, lo aparta a su cuarentena. Aquí se abre una alerta ALTA,
 * PERSISTENTE y una por evento (la clave es su referencia: los reintentos no
 * abren más), para que alguien mire el equipo y decida.
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface EventoRechazable {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly referenciaExterna: string;
}

export const alertarRechazosDelEdge = async (
  alertas: AlertasDeEquipo,
  eventos: readonly EventoRechazable[],
  resultados: readonly { readonly aceptado: boolean; readonly detalle?: string }[],
  actorId: string,
): Promise<number> => {
  let abiertas = 0;
  for (const [i, r] of resultados.entries()) {
    const evento = eventos[i];
    if (r.aceptado || evento === undefined) continue;
    const resultado = await alertas.ejecutar(
      {
        copropiedadId: evento.copropiedadId,
        dispositivoId: evento.dispositivoId,
        tipo: 'acceso_dudoso',
        severidad: 'alta',
        clave: `edge-rechazo:${evento.referenciaExterna}`.slice(0, 120),
        notas:
          `La nube rechaza un acceso que el Edge resolvió sin conexión: ${r.detalle ?? 'sin motivo'}. ` +
          'El acceso ocurrió; el Edge lo reintenta y, al agotar los intentos, lo aparta a su ' +
          'cuarentena (pnpm sitio:edge lo muestra). Revise el equipo y la lectura.',
        persistente: true,
      },
      actorId,
    );
    if (resultado.alerta !== null) abiertas += 1;
  }
  return abiertas;
};
