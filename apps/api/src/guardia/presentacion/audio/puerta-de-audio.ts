import type { Server } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';
import { CONFIGURACION } from '../../../configuracion/configuracion.module';
import type { Configuracion } from '../../../configuracion/esquema';
import {
  atenderActualizacion,
  rechazarActualizacion as rechazar,
} from '../../../comun/despachador-de-actualizaciones';
import {
  ConversacionDeAudio,
  REGISTRO_DE_CONVERSACIONES,
  TEMPORIZADOR_REAL,
} from '../../aplicacion/conversacion-de-audio';
import type { RegistroDeConversaciones } from '../../aplicacion/conversacion-de-audio';
import { CANAL_DE_INTERCOM } from '../../aplicacion/puertos';
import type { CanalConSesiones } from '../../aplicacion/sesiones-de-audio';
import { BilletesDeAudio } from './billetes-de-audio';
import type { DatosDelBillete } from './billetes-de-audio';
import { ipDeLaActualizacion } from './ip-de-la-actualizacion';
import { origenAdmitido } from '../../../comun/origen-de-la-actualizacion';
import type { ConfianzaDeProxy } from './ip-de-la-actualizacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · LA PUERTA DEL WEBSOCKET DE AUDIO (ADR-01, enmienda 15-P)
 *
 * Sólo con `GUARDIA_AUDIO_TRANSPORTE=websocket`. La actualización a WebSocket
 * no pasa por Express ni por sus guardas: por eso no se autentica aquí, se
 * CANJEA un billete que sí pasó por todos (`billetes-de-audio.ts`). Sin
 * billete válido desde esa IP, 401 y el socket se cierra.
 *
 *  · `maxPayload` de 4 KiB y sin compresión (ni mensajes gigantes ni bombas).
 *  · Latido cada 15 s: una consola muda se da por colgada y su turno se suelta.
 *  · El navegador nunca habla con el equipo: va a la conversación (RN-12/21).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const RUTA_DEL_AUDIO = '/guardia/audio';
const LATIDO_MS = 15_000;

const MOTIVO_DEL_NAVEGADOR: Readonly<Record<number, string>> = {
  1000: 'El operador colgó',
  1001: 'La consola se cerró o cambió de página',
  1006: 'Se perdió la conexión con la consola',
};

@Injectable()
export class PuertaDeAudioPorWebSocket implements OnApplicationBootstrap, OnModuleDestroy {
  private servidor: WebSocketServer | null = null;
  private soltarRuta: () => void = () => undefined;
  private latido: ReturnType<typeof setInterval> | null = null;
  private readonly vivos = new WeakSet<WebSocket>();

  constructor(
    @Inject(HttpAdapterHost) private readonly anfitrion: HttpAdapterHost,
    @Inject(BilletesDeAudio) private readonly billetes: BilletesDeAudio,
    @Inject(CANAL_DE_INTERCOM) private readonly canal: CanalConSesiones,
    @Inject(REGISTRO_DE_CONVERSACIONES) private readonly registro: RegistroDeConversaciones,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(GENERADOR_DE_ID) private readonly ids: GeneradorDeId,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  onApplicationBootstrap(): void {
    if (this.configuracion.GUARDIA_AUDIO_TRANSPORTE !== 'websocket') return;
    const adaptador = this.anfitrion.httpAdapter;
    const http = adaptador.getHttpServer() as Server;
    const confia = (adaptador.getInstance() as { get(c: string): unknown }).get(
      'trust proxy fn',
    ) as ConfianzaDeProxy;
    const servidor = new WebSocketServer({
      noServer: true,
      maxPayload: 4096,
      perMessageDeflate: false,
    });
    this.servidor = servidor;
    // 15-Q2 · las demás rutas (el túnel del Edge) las reparte el despachador.
    this.soltarRuta = atenderActualizacion(
      http,
      RUTA_DEL_AUDIO,
      (peticion, socket, cabeza, url) => {
        if (!origenAdmitido(peticion, this.configuracion.origenesPermitidos)) {
          rechazar(socket, '403 Forbidden'); // 15-R · D2 · otra página
          return;
        }
        const datos = this.billetes.consumir(
          url.searchParams.get('billete') ?? '',
          ipDeLaActualizacion(peticion, confia),
        );
        if (datos === null) {
          this.bitacora.registrar(
            'aviso',
            'WebSocket de audio rechazado: billete inválido, gastado, caducado o de otra IP',
            {},
          );
          rechazar(socket, '401 Unauthorized');
          return;
        }
        servidor.handleUpgrade(peticion, socket, cabeza, (ws) => this.atender(ws, datos));
      },
    );
    this.latido = setInterval(() => {
      for (const ws of servidor.clients) {
        if (!this.vivos.has(ws)) {
          ws.terminate();
          continue;
        }
        this.vivos.delete(ws);
        ws.ping();
      }
    }, LATIDO_MS);
    this.latido.unref();
    this.bitacora.registrar('info', 'audio de la guardia por WebSocket', { ruta: RUTA_DEL_AUDIO });
  }

  onModuleDestroy(): void {
    this.soltarRuta();
    if (this.latido !== null) clearInterval(this.latido);
    for (const ws of this.servidor?.clients ?? []) ws.close(1001, 'La API se está cerrando');
    this.servidor?.close();
  }

  private atender(ws: WebSocket, datos: DatosDelBillete): void {
    this.vivos.add(ws);
    ws.on('pong', () => this.vivos.add(ws));
    const conversacion = new ConversacionDeAudio(
      {
        canal: this.canal.deLaConversacion(datos), // 15-S1 · A1: suelta sólo SU sesión
        registro: this.registro,
        reloj: this.reloj,
        ids: this.ids,
        bitacora: this.bitacora,
        temporizador: TEMPORIZADOR_REAL,
      },
      {
        copropiedadId: datos.copropiedadId,
        dispositivoId: datos.dispositivoId,
        operadorId: datos.operadorId,
      },
      {
        audio: (trama) => {
          if (ws.readyState === ws.OPEN) ws.send(trama, { binary: true });
        },
        aviso: (motivo) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ tipo: 'cortado', motivo }));
        },
        // B3 (15-S2) · el equipo calla mientras recibe: la consola muestra el turno.
        semiduplex: () => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ tipo: 'semiduplex' }));
        },
        cerrar: (codigo, motivo) => ws.close(codigo, motivo.slice(0, 120)),
      },
    );
    ws.on('message', (mensaje: RawData, binario: boolean) => {
      const bytes = Array.isArray(mensaje)
        ? Buffer.concat(mensaje)
        : Buffer.from(mensaje as ArrayBuffer);
      if (binario) conversacion.alAudio(new Uint8Array(bytes));
      else conversacion.alTexto(bytes.toString('utf8'));
    });
    // El texto de cierre del navegador NO se guarda; un corte del servidor ya puso el suyo.
    ws.on('close', (codigo: number) => {
      void conversacion.terminar(
        MOTIVO_DEL_NAVEGADOR[codigo] ?? `La consola cerró el canal (código ${String(codigo)})`,
      );
    });
    ws.on('error', () => ws.terminate());
    void conversacion.iniciar();
  }
}
