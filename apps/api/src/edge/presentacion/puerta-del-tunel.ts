import type { Server } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { MENSAJE_MAXIMO_BYTES, RUTA_DEL_TUNEL, SesionDeTunel, leerMensaje } from '@ncr/providers';
import type { Hola } from '@ncr/providers';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { atenderActualizacion } from '../../comun/despachador-de-actualizaciones';
import { TUNELES_DE_EDGE } from '../../proveedores';
import type { TunelesDeEdge } from '../../proveedores';
import { AbrirTunel } from '../aplicacion/abrir-tunel';
import { PublicacionesDelEdge } from '../aplicacion/publicaciones-del-edge';
import { enlaceWs } from './enlace-ws';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A1 · LA PUERTA DEL TÚNEL: `wss://<api>/edge/tunel`
 *
 * La abre SIEMPRE el Edge (saliente: es lo único que cruza el NAT del
 * conjunto). Aquí sólo se traduce el protocolo: el primer mensaje tiene que
 * ser un `hola` en `PLAZO_DEL_HOLA_MS`; quién entra lo decide `AbrirTunel`.
 * Aceptado, se contesta `bienvenida` con la copropiedad que la API le
 * reconoce, y desde ahí todo es la sesión: latido, plazos, ritmo y tamaño.
 *
 * La actualización no pasa por Express ni por sus guardas (como el audio): la
 * autenticación es el `hola` firmado, y por eso `maxPayload` limita el tamaño
 * ANTES de leer un byte de quien todavía no se ha identificado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PLAZO_DEL_HOLA_MS = 5_000;
export const LATIDO_DEL_TUNEL_MS = 10_000;
export const SILENCIO_MAXIMO_MS = 30_000;

@Injectable()
export class PuertaDelTunel implements OnApplicationBootstrap, OnModuleDestroy {
  private servidor: WebSocketServer | null = null;
  private soltarRuta: () => void = () => undefined;

  constructor(
    @Inject(HttpAdapterHost) private readonly anfitrion: HttpAdapterHost,
    @Inject(AbrirTunel) private readonly abrir: AbrirTunel,
    @Inject(PublicacionesDelEdge) private readonly publicaciones: PublicacionesDelEdge,
    @Inject(TUNELES_DE_EDGE) private readonly tuneles: TunelesDeEdge,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  onApplicationBootstrap(): void {
    const http = this.anfitrion.httpAdapter.getHttpServer() as Server;
    const servidor = new WebSocketServer({
      noServer: true,
      maxPayload: MENSAJE_MAXIMO_BYTES,
      perMessageDeflate: false,
    });
    this.servidor = servidor;
    this.soltarRuta = atenderActualizacion(http, RUTA_DEL_TUNEL, (peticion, socket, cabeza) =>
      servidor.handleUpgrade(peticion, socket, cabeza, (ws) => void this.recibir(ws)),
    );
  }

  onModuleDestroy(): void {
    this.soltarRuta();
    for (const ws of this.servidor?.clients ?? []) ws.close(1001, 'La API se está cerrando');
    this.servidor?.close();
  }

  private async recibir(ws: WebSocket): Promise<void> {
    const enlace = enlaceWs(ws);
    const primero = await enlace.primero(PLAZO_DEL_HOLA_MS);
    let hola: Hola;
    try {
      if (typeof primero !== 'string') throw new Error('sin hola');
      const mensaje = leerMensaje(primero);
      if (mensaje.t !== 'hola') throw new Error(`«${mensaje.t}» antes del hola`);
      hola = mensaje;
    } catch {
      enlace.cerrar(1008, 'se esperaba hola');
      return;
    }
    const apertura = await this.abrir.abrir(
      hola,
      () =>
        new SesionDeTunel(enlace, {
          paridad: 'par',
          latidoMs: LATIDO_DEL_TUNEL_MS,
          silencioMaximoMs: SILENCIO_MAXIMO_MS,
          registrar: (mensaje, contexto) =>
            this.bitacora.registrar('aviso', mensaje, { edgeId: hola.edgeId, contexto }),
        }),
    );
    if (!apertura.abierto) {
      enlace.cerrar(apertura.codigo, apertura.motivo);
      return;
    }
    const { tunel, gateway } = apertura;
    enlace.enviar(JSON.stringify({ v: 1, t: 'bienvenida', copropiedadId: gateway.copropiedadId }));
    this.publicaciones.instalar(tunel.sesion, gateway);
    tunel.sesion.alCerrar((motivo) => {
      this.tuneles.liberar(tunel, this.reloj.ahora());
      this.bitacora.registrar('aviso', 'túnel del Edge cerrado', {
        edgeId: gateway.id,
        copropiedadId: gateway.copropiedadId,
        motivo,
      });
    });
  }
}
