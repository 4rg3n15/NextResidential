import type { EventEmitter } from 'node:events';

export function esCancelacionDelCliente(error: unknown): boolean;
export function filtrarCancelacionesDelCliente(
  proceso?: Pick<EventEmitter, 'listeners' | 'removeAllListeners' | 'on'>,
): boolean;
