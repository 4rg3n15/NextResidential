import type { Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { CrearCuentaPorUsuario } from '../cuentas';
import { REPOSITORIO_CONSENTIMIENTOS } from '../biometria';
import type { RepositorioConsentimientos } from '../biometria';
import { AUTORIZACIONES_DEL_RESIDENTE } from './aplicacion/puertos';
import type { AutorizacionesDelResidente } from './aplicacion/puertos';
import {
  ALTA_DEL_RESIDENTE,
  BITACORA_DE_RESIDENTES,
  CODIGOS_DE_OCUPANTE,
  CUENTAS_DE_RESIDENTES,
  OCUPANTES_DE_LA_VIVIENDA,
  PERFIL_DEL_RESIDENTE,
  VEHICULOS_PROPIOS,
} from './aplicacion/puertos-hogar';
import type {
  AltaDelResidente,
  BitacoraDeResidentes,
  CodigosDeOcupante,
  CuentasDeResidentes,
  OcupantesDeLaVivienda,
  PerfilDelResidente,
  VehiculosPropios,
} from './aplicacion/puertos-hogar';
import { ResolverMiAmbito } from './aplicacion/casos-de-uso';
import { VerMiAlta, VincularMiVivienda } from './aplicacion/alta';
import { DeclararMisOcupantes, VerMisOcupantes } from './aplicacion/ocupantes';
import { DesactivarMiVehiculo, RegistrarMiVehiculo } from './aplicacion/vehiculos-propios';
import { EditarMiPerfil, VerMiPerfil } from './aplicacion/perfil';
import { EstadoDelConsentimientoDeMiVisitante } from './aplicacion/consentimiento-de-mi-visitante';
import {
  CuentasDeResidentesDelSuperadmin,
  OcupantesDelSuperadmin,
} from './aplicacion/supervision-de-residentes';
import { AltaDelResidentePg } from './infraestructura/alta-pg';
import { OcupantesDeLaViviendaPg } from './infraestructura/ocupantes-pg';
import { VehiculosPropiosPg } from './infraestructura/vehiculos-propios-pg';
import { PerfilDelResidentePg } from './infraestructura/perfil-pg';
import {
  BitacoraDeResidentesPg,
  CuentasDeResidentesPg,
} from './infraestructura/bitacora-residentes-pg';
import { CodigosDeOcupanteHmac } from './infraestructura/codigos-de-ocupante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA RAÍZ DE COMPOSICIÓN DEL HOGAR DEL RESIDENTE · ETAPA 15-I
 *
 * Aparte de `residente.module.ts` para que la raíz del módulo siga leyéndose
 * de un vistazo. Los adaptadores son los de PostgreSQL; el banco de pruebas sin
 * base los sustituye por su doble (`test/dobles/hogar-en-memoria.ts`), igual
 * que al resto del módulo. La llave de los códigos de ocupante es la maestra ya
 * declarada, derivada con su propio propósito (ADR-025): no hay variable nueva.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PROVEEDORES_DEL_HOGAR: Provider[] = [
  {
    provide: ALTA_DEL_RESIDENTE,
    inject: [Pool],
    useFactory: (p: Pool) => new AltaDelResidentePg(p),
  },
  {
    provide: OCUPANTES_DE_LA_VIVIENDA,
    inject: [Pool],
    useFactory: (p: Pool) => new OcupantesDeLaViviendaPg(p),
  },
  {
    provide: VEHICULOS_PROPIOS,
    inject: [Pool],
    useFactory: (p: Pool) => new VehiculosPropiosPg(p),
  },
  {
    provide: PERFIL_DEL_RESIDENTE,
    inject: [Pool],
    useFactory: (p: Pool) => new PerfilDelResidentePg(p),
  },
  {
    provide: BITACORA_DE_RESIDENTES,
    inject: [Pool],
    useFactory: (p: Pool) => new BitacoraDeResidentesPg(p),
  },
  {
    provide: CUENTAS_DE_RESIDENTES,
    inject: [Pool],
    useFactory: (p: Pool) => new CuentasDeResidentesPg(p),
  },
  {
    provide: CODIGOS_DE_OCUPANTE,
    inject: [CONFIGURACION],
    useFactory: (c: Configuracion) => new CodigosDeOcupanteHmac(c.BIOMETRIA_LLAVE),
  },
  {
    provide: VerMiAlta,
    inject: [ALTA_DEL_RESIDENTE],
    useFactory: (a: AltaDelResidente) => new VerMiAlta(a),
  },
  {
    provide: VincularMiVivienda,
    inject: [ALTA_DEL_RESIDENTE, CODIGOS_DE_OCUPANTE, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (a: AltaDelResidente, c: CodigosDeOcupante, b: BitacoraDeResidentes, r: Reloj) =>
      new VincularMiVivienda(a, c, b, r),
  },
  {
    provide: VerMisOcupantes,
    inject: [ResolverMiAmbito, OCUPANTES_DE_LA_VIVIENDA, CODIGOS_DE_OCUPANTE],
    useFactory: (r: ResolverMiAmbito, o: OcupantesDeLaVivienda, c: CodigosDeOcupante) =>
      new VerMisOcupantes(r, o, c),
  },
  {
    provide: DeclararMisOcupantes,
    inject: [
      ResolverMiAmbito,
      OCUPANTES_DE_LA_VIVIENDA,
      VerMisOcupantes,
      BITACORA_DE_RESIDENTES,
      RELOJ,
    ],
    useFactory: (
      r: ResolverMiAmbito,
      o: OcupantesDeLaVivienda,
      v: VerMisOcupantes,
      b: BitacoraDeResidentes,
      reloj: Reloj,
    ) => new DeclararMisOcupantes(r, o, v, b, reloj),
  },
  {
    provide: RegistrarMiVehiculo,
    inject: [ResolverMiAmbito, VEHICULOS_PROPIOS, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (r: ResolverMiAmbito, v: VehiculosPropios, b: BitacoraDeResidentes, reloj: Reloj) =>
      new RegistrarMiVehiculo(r, v, b, reloj),
  },
  {
    provide: DesactivarMiVehiculo,
    inject: [ResolverMiAmbito, VEHICULOS_PROPIOS],
    useFactory: (r: ResolverMiAmbito, v: VehiculosPropios) => new DesactivarMiVehiculo(r, v),
  },
  {
    provide: VerMiPerfil,
    inject: [PERFIL_DEL_RESIDENTE],
    useFactory: (p: PerfilDelResidente) => new VerMiPerfil(p),
  },
  {
    provide: EditarMiPerfil,
    inject: [PERFIL_DEL_RESIDENTE, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (p: PerfilDelResidente, b: BitacoraDeResidentes, r: Reloj) =>
      new EditarMiPerfil(p, b, r),
  },
  {
    provide: EstadoDelConsentimientoDeMiVisitante,
    inject: [ResolverMiAmbito, AUTORIZACIONES_DEL_RESIDENTE, REPOSITORIO_CONSENTIMIENTOS],
    useFactory: (
      r: ResolverMiAmbito,
      a: AutorizacionesDelResidente,
      c: RepositorioConsentimientos,
    ) => new EstadoDelConsentimientoDeMiVisitante(r, a, c),
  },
  {
    provide: CuentasDeResidentesDelSuperadmin,
    inject: [
      CrearCuentaPorUsuario,
      CUENTAS_DE_RESIDENTES,
      VEHICULOS_PROPIOS,
      BITACORA_DE_RESIDENTES,
      RELOJ,
    ],
    useFactory: (
      crear: CrearCuentaPorUsuario,
      cuentas: CuentasDeResidentes,
      v: VehiculosPropios,
      b: BitacoraDeResidentes,
      r: Reloj,
    ) => new CuentasDeResidentesDelSuperadmin(crear, cuentas, v, b, r),
  },
  {
    provide: OcupantesDelSuperadmin,
    inject: [OCUPANTES_DE_LA_VIVIENDA, CODIGOS_DE_OCUPANTE, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (
      o: OcupantesDeLaVivienda,
      c: CodigosDeOcupante,
      b: BitacoraDeResidentes,
      r: Reloj,
    ) => new OcupantesDelSuperadmin(o, c, b, r),
  },
];
