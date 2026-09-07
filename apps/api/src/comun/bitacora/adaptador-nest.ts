import type { LoggerService } from '@nestjs/common';
import type { Bitacora, NivelBitacora } from '@ncr/domain-core';

/**
 * Adapta la bitácora del dominio al `LoggerService` de Nest.
 *
 * Sin esto el proceso emite DOS formatos: JSON por nuestro lado y texto
 * coloreado por el del framework. Un recolector de logs no puede analizar el
 * segundo, así que precisamente los mensajes de arranque y de error del
 * framework —los que más falta hacen en una caída— quedarían fuera de la
 * observabilidad de la ETAPA 14.
 */
export class AdaptadorDeBitacoraNest implements LoggerService {
  constructor(private readonly bitacora: Bitacora) {}

  private emitir(nivel: NivelBitacora, mensaje: unknown, contexto?: unknown): void {
    this.bitacora.registrar(
      nivel,
      typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje),
      {
        origen: 'nest',
        ...(typeof contexto === 'string' ? { componente: contexto } : {}),
      },
    );
  }

  log(m: unknown, c?: unknown): void {
    this.emitir('info', m, c);
  }
  error(m: unknown, c?: unknown): void {
    this.emitir('error', m, c);
  }
  warn(m: unknown, c?: unknown): void {
    this.emitir('aviso', m, c);
  }
  debug(m: unknown, c?: unknown): void {
    this.emitir('debug', m, c);
  }
  verbose(m: unknown, c?: unknown): void {
    this.emitir('debug', m, c);
  }
}
