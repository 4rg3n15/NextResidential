import type { Provider } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { Pool } from 'pg';
import { RostroDeResidente } from '../biometria';
import { ResolverMiAmbito } from './aplicacion/casos-de-uso';
import { MiRostro } from './aplicacion/mi-rostro';
import { BITACORA_DE_RESIDENTES, OCUPANTES_DE_LA_VIVIENDA } from './aplicacion/puertos-hogar';
import type { BitacoraDeResidentes, OcupantesDeLaVivienda } from './aplicacion/puertos-hogar';
import { MENORES_PARA_EL_ROSTRO, RostroDeMisMenores } from './aplicacion/rostro-de-mis-menores';
import type { MenoresParaElRostro } from './aplicacion/rostro-de-mis-menores';
import { MenoresParaElRostroPg } from './infraestructura/menores-para-el-rostro-pg';

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
  // D3 · el rostro de un menor de 15 a 17 años, por el titular del hogar.
  {
    provide: MENORES_PARA_EL_ROSTRO,
    inject: [Pool],
    useFactory: (pool: Pool) => new MenoresParaElRostroPg(pool),
  },
  {
    provide: RostroDeMisMenores,
    inject: [
      ResolverMiAmbito,
      OCUPANTES_DE_LA_VIVIENDA,
      MENORES_PARA_EL_ROSTRO,
      RostroDeResidente,
      BITACORA_DE_RESIDENTES,
      RELOJ,
      CONFIGURACION,
    ],
    useFactory: (
      ambito: ResolverMiAmbito,
      ocupantes: OcupantesDeLaVivienda,
      menores: MenoresParaElRostro,
      rostro: RostroDeResidente,
      bitacora: BitacoraDeResidentes,
      reloj: Reloj,
      c: Configuracion,
    ) =>
      new RostroDeMisMenores(
        ambito,
        ocupantes,
        menores,
        rostro,
        bitacora,
        reloj,
        c.ROSTRO_RESIDENTE_RETENCION_DIAS,
      ),
  },
];
