import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ContextoTenant } from '../../autenticacion/dominio/claims';

export const CLAVE_CONTEXTO = 'ncrContexto';

/**
 * El caso de uso recibe el contexto del tenant como PARÁMETRO, no lo busca.
 * Si tuviera que ir a buscarlo, podría olvidarse de hacerlo; así el contexto
 * está en la firma y el compilador lo exige.
 */
export const Contexto = createParamDecorator((_dato: unknown, ctx: ExecutionContext) => {
  const peticion = ctx.switchToHttp().getRequest<Request & Record<string, unknown>>();
  return peticion[CLAVE_CONTEXTO] as ContextoTenant | undefined;
});
