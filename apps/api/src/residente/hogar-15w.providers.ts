import type { Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { RevocarAutorizacion } from '../autorizaciones';
import { SuprimirRostroDeAutorizacion, SuprimirYRetirarYa } from '../biometria';
import { PROPOSITOS } from '../comun/cripto/sobre-aes-gcm';
import { ResolverMiAmbito } from './aplicacion/casos-de-uso';
import {
  ALTA_DEL_RESIDENTE,
  BITACORA_DE_RESIDENTES,
  CODIGOS_DE_OCUPANTE,
  OCUPANTES_DE_LA_VIVIENDA,
  VEHICULOS_PROPIOS,
} from './aplicacion/puertos-hogar';
import type {
  AltaDelResidente,
  BitacoraDeResidentes,
  CodigosDeOcupante,
  OcupantesDeLaVivienda,
  VehiculosPropios,
} from './aplicacion/puertos-hogar';
import { PRIMER_INGRESO } from './aplicacion/puertos-del-primer-ingreso';
import type { PrimerIngreso } from './aplicacion/puertos-del-primer-ingreso';
import { TITULARIDAD_DE_VIVIENDAS } from './aplicacion/puertos-de-titularidad';
import type { TitularidadDeViviendas } from './aplicacion/puertos-de-titularidad';
import { SUSPENSION_DEL_REGISTRO } from './aplicacion/puertos-de-suspension';
import type { SuspensionDelRegistro } from './aplicacion/puertos-de-suspension';
import { PLAZAS_DEL_TITULAR } from './aplicacion/puertos-de-plazas';
import type { PlazasDelTitular } from './aplicacion/puertos-de-plazas';
import { MENORES_DEL_HOGAR } from './aplicacion/puertos-de-menores';
import type { MenoresDelHogar } from './aplicacion/puertos-de-menores';
import { EDICION_DE_VEHICULOS_PROPIOS } from './aplicacion/puertos-de-vehiculos-propios';
import type { EdicionDeVehiculosPropios } from './aplicacion/puertos-de-vehiculos-propios';
import { CompletarMiPrimerIngreso } from './aplicacion/primer-ingreso';
import {
  RegistroDeResidentesDelSuperadmin,
  TitularesDeViviendas,
} from './aplicacion/titulares-y-registro';
import { PlazasDeMiVivienda, TopeDePlazasDeVivienda } from './aplicacion/plazas-del-titular';
import { MenoresDeMiHogar, TRASPASOS } from './aplicacion/menores-del-hogar';
import { EditarYEliminarMiVehiculo } from './aplicacion/vehiculos-propios-edicion';
import { RevocarMiVisita, VISITAS_DE_MI_VIVIENDA } from './aplicacion/revocar-mi-visita';
import {
  TOPE_DE_LA_COPROPIEDAD,
  TopeDePlazasPorOmision,
} from './aplicacion/tope-de-la-copropiedad';
import type { TopeDePlazasDeLaCopropiedad } from './aplicacion/tope-de-la-copropiedad';
import { TopeDePlazasDeLaCopropiedadPg } from './infraestructura/tope-de-la-copropiedad-pg';
import type { VisitasDeMiVivienda } from './aplicacion/revocar-mi-visita';
import { PrimerIngresoPg } from './infraestructura/primer-ingreso-pg';
import { TitularidadDeViviendasPg } from './infraestructura/titularidad-pg';
import { SuspensionDelRegistroPg } from './infraestructura/suspension-del-registro-pg';
import { PlazasDelTitularPg } from './infraestructura/plazas-del-titular-pg';
import { MenoresDelHogarPg } from './infraestructura/menores-pg';
import { EdicionDeVehiculosPropiosPg } from './infraestructura/vehiculos-propios-edicion-pg';
import { VisitasDeMiViviendaPg } from './infraestructura/visitas-de-mi-vivienda-pg';
import { CodigosDeOcupanteHmac } from './infraestructura/codigos-de-ocupante';
import { InvitacionesDeResidentePg } from './infraestructura/invitaciones-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA RAÍZ DE COMPOSICIÓN DE LA RONDA 15-W · CUENTAS Y HOGAR
 *
 * Aparte de `hogar.providers.ts` (15-I) por tamaño y por ronda. Las llaves de
 * los códigos de traspaso y del HMAC de la IP del registro salen de la maestra
 * ya declarada, cada una con su propósito (ADR-025): ninguna variable nueva.
 * `INVITACIONES_DE_RESIDENTE` se inscribe en cuentas al arrancar el módulo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const INVITACIONES_DE_RESIDENTE = Symbol('INVITACIONES_DE_RESIDENTE');

const pg =
  <T>(Clase: new (p: Pool) => T) =>
  (p: Pool): T =>
    new Clase(p);

export const PROVEEDORES_DE_LA_15W: Provider[] = [
  { provide: PRIMER_INGRESO, inject: [Pool], useFactory: pg(PrimerIngresoPg) },
  { provide: TITULARIDAD_DE_VIVIENDAS, inject: [Pool], useFactory: pg(TitularidadDeViviendasPg) },
  { provide: SUSPENSION_DEL_REGISTRO, inject: [Pool], useFactory: pg(SuspensionDelRegistroPg) },
  { provide: PLAZAS_DEL_TITULAR, inject: [Pool], useFactory: pg(PlazasDelTitularPg) },
  { provide: MENORES_DEL_HOGAR, inject: [Pool], useFactory: pg(MenoresDelHogarPg) },
  {
    provide: EDICION_DE_VEHICULOS_PROPIOS,
    inject: [Pool],
    useFactory: pg(EdicionDeVehiculosPropiosPg),
  },
  { provide: VISITAS_DE_MI_VIVIENDA, inject: [Pool], useFactory: pg(VisitasDeMiViviendaPg) },
  {
    provide: TOPE_DE_LA_COPROPIEDAD,
    inject: [Pool],
    useFactory: pg(TopeDePlazasDeLaCopropiedadPg),
  },
  {
    provide: TopeDePlazasPorOmision,
    inject: [TOPE_DE_LA_COPROPIEDAD, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (t: TopeDePlazasDeLaCopropiedad, b: BitacoraDeResidentes, r: Reloj) =>
      new TopeDePlazasPorOmision(t, b, r),
  },
  {
    provide: TRASPASOS,
    inject: [CONFIGURACION],
    useFactory: (c: Configuracion) =>
      new CodigosDeOcupanteHmac(c.BIOMETRIA_LLAVE, PROPOSITOS.codigoDeTraspaso),
  },
  {
    provide: INVITACIONES_DE_RESIDENTE,
    inject: [Pool, CODIGOS_DE_OCUPANTE, TRASPASOS, CONFIGURACION, RELOJ],
    useFactory: (p: Pool, i: CodigosDeOcupante, t: CodigosDeOcupante, c: Configuracion, r: Reloj) =>
      new InvitacionesDeResidentePg(p, i, t, c.BIOMETRIA_LLAVE, () => r.ahora()),
  },
  {
    provide: CompletarMiPrimerIngreso,
    inject: [ALTA_DEL_RESIDENTE, PRIMER_INGRESO, RELOJ],
    useFactory: (a: AltaDelResidente, p: PrimerIngreso, r: Reloj) =>
      new CompletarMiPrimerIngreso(a, p, r),
  },
  {
    provide: TitularesDeViviendas,
    inject: [TITULARIDAD_DE_VIVIENDAS],
    useFactory: (t: TitularidadDeViviendas) => new TitularesDeViviendas(t),
  },
  {
    provide: RegistroDeResidentesDelSuperadmin,
    inject: [SUSPENSION_DEL_REGISTRO, RELOJ],
    useFactory: (s: SuspensionDelRegistro, r: Reloj) => new RegistroDeResidentesDelSuperadmin(s, r),
  },
  {
    provide: PlazasDeMiVivienda,
    inject: [ResolverMiAmbito, PLAZAS_DEL_TITULAR, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (a: ResolverMiAmbito, p: PlazasDelTitular, b: BitacoraDeResidentes, r: Reloj) =>
      new PlazasDeMiVivienda(a, p, b, r),
  },
  {
    provide: TopeDePlazasDeVivienda,
    inject: [PLAZAS_DEL_TITULAR, BITACORA_DE_RESIDENTES, RELOJ],
    useFactory: (p: PlazasDelTitular, b: BitacoraDeResidentes, r: Reloj) =>
      new TopeDePlazasDeVivienda(p, b, r),
  },
  {
    provide: MenoresDeMiHogar,
    inject: [
      ResolverMiAmbito,
      MENORES_DEL_HOGAR,
      OCUPANTES_DE_LA_VIVIENDA,
      TRASPASOS,
      RELOJ,
      SuprimirYRetirarYa,
    ],
    useFactory: (
      a: ResolverMiAmbito,
      m: MenoresDelHogar,
      o: OcupantesDeLaVivienda,
      t: CodigosDeOcupante,
      r: Reloj,
      s: SuprimirYRetirarYa,
    ) => new MenoresDeMiHogar(a, m, o, t, r, s),
  },
  {
    provide: EditarYEliminarMiVehiculo,
    inject: [
      ResolverMiAmbito,
      EDICION_DE_VEHICULOS_PROPIOS,
      VEHICULOS_PROPIOS,
      BITACORA_DE_RESIDENTES,
      RELOJ,
    ],
    useFactory: (
      a: ResolverMiAmbito,
      e: EdicionDeVehiculosPropios,
      v: VehiculosPropios,
      b: BitacoraDeResidentes,
      r: Reloj,
    ) => new EditarYEliminarMiVehiculo(a, e, v, b, r),
  },
  {
    provide: RevocarMiVisita,
    inject: [
      ResolverMiAmbito,
      VISITAS_DE_MI_VIVIENDA,
      RevocarAutorizacion,
      SuprimirRostroDeAutorizacion,
      BITACORA_DE_RESIDENTES,
      RELOJ,
    ],
    useFactory: (
      a: ResolverMiAmbito,
      v: VisitasDeMiVivienda,
      rev: RevocarAutorizacion,
      s: SuprimirRostroDeAutorizacion,
      b: BitacoraDeResidentes,
      r: Reloj,
    ) => new RevocarMiVisita(a, v, rev, s, b, r),
  },
];
