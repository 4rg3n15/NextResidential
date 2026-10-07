import type { Provider } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { RostroDeResidente } from '../biometria';
import { ResolverMiAmbito } from './aplicacion/casos-de-uso';
import { MiRostro } from './aplicacion/mi-rostro';
import { BITACORA_DE_RESIDENTES } from './aplicacion/puertos-hogar';
import type { BitacoraDeResidentes } from './aplicacion/puertos-hogar';

/**
 * 15-X · la raíz de composición del rostro del residente. Sólo la puerta: la
 * biometría pone `RostroDeResidente` y este módulo no inyecta ni la bóveda, ni
 * los repositorios de plantillas, ni el proveedor de terminales.
 */
export const PROVEEDORES_DEL_ROSTRO_DEL_RESIDENTE: Provider[] = [
  {
    provide: MiRostro,
    inject: [ResolverMiAmbito, RostroDeResidente, BITACORA_DE_RESIDENTES, RELOJ, CONFIGURACION],
    useFactory: (
      ambito: ResolverMiAmbito,
      rostro: RostroDeResidente,
      bitacora: BitacoraDeResidentes,
      reloj: Reloj,
      c: Configuracion,
    ) => new MiRostro(ambito, rostro, bitacora, reloj, c.ROSTRO_RESIDENTE_RETENCION_DIAS),
  },
];
