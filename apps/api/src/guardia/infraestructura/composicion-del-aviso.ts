import type { FactoryProvider } from '@nestjs/common';
import { GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { GeneradorDeId, Reloj } from '@ncr/domain-core';
import { ESCALAMIENTO_DE_ALERTA, NOTIFICADOR_PUSH } from '../../eventos';
import { AvisarAlResidente } from '../aplicacion/aviso-al-residente';
import type { AvisoAlTelefono } from '../aplicacion/aviso-al-residente';
import type { EscalamientoDeAlerta } from '../aplicacion/puertos';

/** 15-R · DT-15N-02 · el aviso de la guardia, con el notificador que publica `eventos`. */
export const PROVEEDOR_DE_AVISO_AL_RESIDENTE: FactoryProvider<AvisarAlResidente> = {
  provide: AvisarAlResidente,
  inject: [ESCALAMIENTO_DE_ALERTA, NOTIFICADOR_PUSH, RELOJ, GENERADOR_DE_ID],
  useFactory: (e: EscalamientoDeAlerta, t: AvisoAlTelefono, r: Reloj, ids: GeneradorDeId) =>
    new AvisarAlResidente(e, t, r, ids),
};
