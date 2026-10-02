/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · LO QUE EL EDGE ATIENDE DE LA NUBE, además de las órdenes del puerto
 * (`ejecutarOrdenes` de providers):
 *
 *  · `credencial.guardar` (D1/D2) — un equipo, con su clave o sin ella (se
 *    conserva la que hay). Se guarda CIFRADO y se contesta si, con ella, el
 *    equipo autentica: es lo que la migración espera antes de borrar la de la
 *    nube (D3). La clave no vuelve por ninguna respuesta.
 *  · `credencial.retirar` y el aviso `equipos.vigentes` — bajas.
 *  · `equipo.diagnosticar` / `equipo.corregir` (C2) — «Probar conexión» y las
 *    correcciones, que no van por el puerto. Si la nube manda `edge:<equipo>`
 *    en lugar de la clave, se pone la del registro, y SÓLO contra el host de
 *    ese equipo: una nube comprometida no puede llevarse una credencial a otro.
 *  · `video.whep` (E2) — la oferta del navegador, al go2rtc local.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import {
  aplicarCorreccion,
  diagnosticarEquipo,
  EquipoNoRegistrado,
  ProtocoloInvalido,
} from '@ncr/providers';
import type { ProveedorDeEquipos, SesionDeTunel } from '@ncr/providers';
import { z } from 'zod';
import type { CamaraDelEdge } from '../http/servidor-local';
import type { EquipoDelPuente, RegistroCifrado } from '../equipos/registro-cifrado';
import type { Go2rtcLocal } from '../video/go2rtc-local';

export interface DependenciasDelEdge {
  readonly registro: RegistroCifrado;
  readonly proveedor: ProveedorDeEquipos;
  /** La lista que lee el receptor local de las cámaras: se reescribe en sitio. */
  readonly camaras: CamaraDelEdge[];
  readonly video: Go2rtcLocal;
  readonly ahora: () => Date;
}

const equipoQueLlega = z
  .object({
    dispositivoId: z.string().uuid(),
    tipo: z.enum(['camara_lpr', 'terminal_facial', 'intercom', 'rele', 'controlador_io']),
    host: z.string().min(1).max(253),
    puerto: z.number().int().min(1).max(65_535),
    protocolo: z.enum(['http', 'https']),
    usuario: z.string().min(1).max(64).nullable(),
    clave: z.string().min(1).max(128).optional(),
    secretoAlarmServer: z.string().min(32).max(128).optional(),
  })
  .passthrough();

const CLAVE_EN_EL_EDGE = /^edge:([0-9a-f-]{36})$/i;
const NOMBRE_DE_FLUJO = /^[A-Za-z0-9_-]{1,64}$/;

export const sincronizarCamaras = (registro: RegistroCifrado, camaras: CamaraDelEdge[]): void => {
  camaras.splice(
    0,
    camaras.length,
    ...registro
      .todos()
      .flatMap((e) =>
        e.secretoAlarmServer === undefined
          ? []
          : [{ dispositivoId: e.dispositivoId, host: e.host, secreto: e.secretoAlarmServer }],
      ),
  );
};

/** La clave que se presenta: la que manda la nube, o la del registro para ESE host. */
const claveParaElEquipo = (registro: RegistroCifrado, host: unknown, clave: unknown): unknown => {
  const referencia = typeof clave === 'string' ? CLAVE_EN_EL_EDGE.exec(clave) : null;
  if (referencia === null) return clave;
  const guardado = registro.todos().find((e) => e.dispositivoId === referencia[1]);
  if (guardado === undefined || guardado.host !== host)
    throw new EquipoNoRegistrado(String(referencia[1]));
  return guardado.clave;
};

export const atenderLaNube = (sesion: SesionDeTunel, d: DependenciasDelEdge): void => {
  const retirar = (id: string): void => {
    d.registro.retirar(id);
    d.proveedor.olvidar?.(id);
  };

  sesion.atender('credencial.guardar', async (carga) => {
    const leido = equipoQueLlega.safeParse((carga as { equipo?: unknown } | null)?.equipo);
    if (!leido.success) throw new ProtocoloInvalido('equipo sin forma');
    const { clave, usuario, ...resto } = leido.data;
    const anterior = d.registro.todos().find((e) => e.dispositivoId === resto.dispositivoId);
    const vigente = clave ?? anterior?.clave;
    if (vigente === undefined || usuario === null) {
      throw new EquipoNoRegistrado(`${resto.dispositivoId} (el Edge no tiene su credencial)`);
    }
    const equipo = {
      ...anterior,
      ...resto,
      usuario,
      clave: vigente,
      ...(resto.secretoAlarmServer === undefined && anterior?.secretoAlarmServer !== undefined
        ? { secretoAlarmServer: anterior.secretoAlarmServer }
        : {}),
    } as EquipoDelPuente;
    d.registro.guardar(equipo, d.ahora());
    d.proveedor.olvidar?.(equipo.dispositivoId);
    sincronizarCamaras(d.registro, d.camaras);
    const estado = await d.proveedor
      .estado(equipo.dispositivoId)
      .catch(() => 'fuera_de_linea' as const);
    return { autenticado: estado === 'en_linea', estado };
  });

  sesion.atender('credencial.retirar', async (carga) => {
    const { dispositivoId } = (carga ?? {}) as { dispositivoId?: unknown };
    if (typeof dispositivoId !== 'string') throw new ProtocoloInvalido('retirar sin equipo');
    retirar(dispositivoId);
    sincronizarCamaras(d.registro, d.camaras);
    return null;
  });

  sesion.atender('equipos.vigentes', (carga) => {
    const { vigentes } = (carga ?? {}) as { vigentes?: unknown };
    if (!Array.isArray(vigentes)) return;
    const siguen = new Set(vigentes.filter((v): v is string => typeof v === 'string'));
    for (const e of d.registro.todos()) if (!siguen.has(e.dispositivoId)) retirar(e.dispositivoId);
    sincronizarCamaras(d.registro, d.camaras);
  });

  sesion.atender('equipo.diagnosticar', async (carga) => {
    const op = (carga ?? {}) as Parameters<typeof diagnosticarEquipo>[0];
    return diagnosticarEquipo({
      ...op,
      clave: claveParaElEquipo(d.registro, op.host, op.clave) as string,
    });
  });

  sesion.atender('equipo.corregir', async (carga) => {
    const op = (carga ?? {}) as Parameters<typeof aplicarCorreccion>[0];
    return aplicarCorreccion({
      ...op,
      clave: claveParaElEquipo(d.registro, op.host, op.clave) as string,
    });
  });

  sesion.atender('video.whep', async (carga) => {
    const { dispositivoId, nombre, ofertaSdp } = (carga ?? {}) as Record<string, unknown>;
    if (typeof dispositivoId !== 'string' || typeof ofertaSdp !== 'string') {
      throw new ProtocoloInvalido('video sin equipo u oferta');
    }
    if (typeof nombre !== 'string' || !NOMBRE_DE_FLUJO.test(nombre))
      throw new ProtocoloInvalido('flujo');
    if (!d.registro.todos().some((e) => e.dispositivoId === dispositivoId)) {
      throw new EquipoNoRegistrado(dispositivoId);
    }
    const origen = await d.proveedor.origenDeVideo(dispositivoId);
    if (origen === null) throw new Error('este tipo de equipo no emite video');
    return d.video.negociar(nombre, origen.rtsp, ofertaSdp);
  });
};
