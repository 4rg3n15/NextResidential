import { Injectable } from '@nestjs/common';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { Inject } from '@nestjs/common';
import type {
  OperacionesDeDispositivo,
  ResultadoDeOperacion,
  SolicitudDeOperacion,
} from '../aplicacion/operaciones-de-dispositivo';

/**
 * Adaptador de operaciones **sin hardware** (ADR-03). Registra la intención en
 * la bitácora —quién, qué equipo, qué operación— y la mantiene pendiente hasta
 * que el adaptador del fabricante, en la ETAPA 15, la consuma.
 *
 * La cola vive en memoria a propósito y está declarado como deuda: persistirla
 * exigiría una tabla de órdenes que la ETAPA 15 va a diseñar con el protocolo
 * real delante. Lo que NO se pierde es la traza: la bitácora es estructurada y
 * va al mismo sitio que el resto.
 */
@Injectable()
export class OperacionesEnMemoria implements OperacionesDeDispositivo {
  private readonly pendientes = new Map<string, Set<string>>();

  constructor(@Inject(BITACORA) private readonly bitacora: Bitacora) {}

  async solicitar(s: SolicitudDeOperacion): Promise<ResultadoDeOperacion> {
    const cola = this.pendientes.get(s.copropiedadId) ?? new Set<string>();
    cola.add(s.dispositivoId);
    this.pendientes.set(s.copropiedadId, cola);

    // Auditoría de quién ordenó qué sobre qué equipo. RN-08 exige atribución en
    // la apertura remota; una orden de reinicio merece la misma.
    this.bitacora.registrar('info', 'operación de dispositivo solicitada', {
      copropiedadId: s.copropiedadId,
      dispositivoId: s.dispositivoId,
      operacion: s.operacion,
      solicitadaPor: s.solicitadaPor,
      ejecucion: 'pendiente · el adaptador real entra en la ETAPA 15',
    });

    return {
      encolada: true,
      operacion: s.operacion,
      estado: 'sincronizando',
      detalle:
        'Orden registrada y atribuida. La ejecución contra el equipo llega con la ' +
        'integración de hardware (ETAPA 15); hasta entonces no se contacta ningún equipo.',
    };
  }

  async pendientesDe(copropiedadId: string): Promise<readonly string[]> {
    return [...(this.pendientes.get(copropiedadId) ?? [])];
  }
}
