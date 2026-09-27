import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import {
  COPROPIEDAD_DE_EQUIPO,
  CORRECTOR_DE_EQUIPO,
  EQUIPOS_ACTIVOS,
  EQUIPOS_QUE_EMITEN,
  REPOSITORIO_DE_EQUIPOS,
  OLVIDO_DE_EQUIPO,
  SONDA_DE_EQUIPO,
} from './aplicacion/puertos';
import type { CorrectorDeEquipo, OlvidoDeEquipo } from './aplicacion/puertos';
import { LECTOR_DE_SENALES } from './aplicacion/senal-de-eventos';
import type { LectorDeSenales } from './aplicacion/senal-de-eventos';
import { PROVEEDOR_DE_EQUIPOS } from '../proveedores';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { RepositorioDeAtestaciones, RepositorioDeEquipos } from './aplicacion/puertos';
import { REPOSITORIO_DE_ATESTACIONES } from './aplicacion/puertos';
import { RegistrarAtestacionDelInstalador } from './aplicacion/atestacion-del-instalador';
import {
  RepositorioDeAtestacionesEnMemoria,
  RepositorioDeAtestacionesPg,
} from './infraestructura/atestaciones';
import { AtestacionesController } from './presentacion/atestaciones.controller';
import {
  TERMINALES_DE_ROSTROS,
  TerminalesDeRostrosDesdeRegistro,
} from './aplicacion/terminales-de-rostros';
import { RepositorioDeEquiposPg } from './infraestructura/repositorio-equipos-pg';
import { SondaPorProveedor } from './infraestructura/sonda-por-proveedor';
import { CorrectorPorProveedor } from './infraestructura/corrector-por-proveedor';
import { CopropiedadDeEquipoEnCache } from './infraestructura/copropiedad-de-equipo-en-cache';
import { IpDelMacPorInterfaces, SecretosDeLaDeclaracion } from './infraestructura/ip-del-mac';
import {
  CambiarVerificacionRemota,
  EnviarEventosAEsteMac,
} from './aplicacion/configuracion-en-sitio';
import { ConfiguracionEnSitioController } from './presentacion/configuracion-en-sitio.controller';
import {
  AvisoDeEquiposSimuladosAlArrancar,
  EquiposSimuladosController,
} from './presentacion/equipos-simulados.controller';
import { EquiposController } from './presentacion/equipos.controller';
import { NombresDeEquiposController } from './presentacion/nombres-de-equipos.controller';
import { ALCANCE_DE_EQUIPOS, AlcanceDeEquipos } from './presentacion/alcance-de-equipos';
import { REGISTRO_AUDITORIA } from '../comun/auditoria';
import type { RegistroDeAuditoria } from '../comun/auditoria';

/**
 * Raíz de composición del aprovisionamiento de equipos.
 *
 * La sonda es un PUERTO y no una llamada directa: es lo que permite que la
 * suite pruebe los cuatro resultados —alcanzado, decide por su cuenta,
 * credencial rechazada, inalcanzable— **sin un solo equipo y sin red** (ADR-03),
 * y lo que permitirá mañana sondear un fabricante distinto sin tocar el
 * controlador.
 */
@Module({})
export class EquiposModule {
  static registrar(): DynamicModule {
    return {
      module: EquiposModule,
      controllers: [
        EquiposController,
        AtestacionesController,
        NombresDeEquiposController,
        ConfiguracionEnSitioController,
        EquiposSimuladosController,
      ],
      providers: [
        // F3 (corrección de la 15-L) · simulado con equipos reales: se dice al arrancar.
        AvisoDeEquiposSimuladosAlArrancar,
        {
          // F2 (corrección de la 15-L) · de quién es cada equipo, recordado
          // 30 s para el camino del veredicto; se suelta con el olvido de abajo.
          provide: CopropiedadDeEquipoEnCache,
          inject: [REPOSITORIO_DE_EQUIPOS, RELOJ],
          useFactory: (equipos: RepositorioDeEquipos, reloj: Reloj) =>
            new CopropiedadDeEquipoEnCache(
              { copropiedadDe: (id) => equipos.copropiedadDeActivo(id) },
              () => reloj.ahora().getTime(),
            ),
        },
        {
          // C2 (corrección de la 15-L) · «Enviar eventos a este Mac».
          provide: EnviarEventosAEsteMac,
          inject: [REPOSITORIO_DE_EQUIPOS, CORRECTOR_DE_EQUIPO, CONFIGURACION, OLVIDO_DE_EQUIPO],
          useFactory: (
            equipos: RepositorioDeEquipos,
            corrector: CorrectorDeEquipo,
            c: Configuracion,
            olvido: OlvidoDeEquipo,
          ) =>
            new EnviarEventosAEsteMac(
              equipos,
              corrector,
              new IpDelMacPorInterfaces(c.ALARM_SERVER_IP_ANUNCIADA),
              new SecretosDeLaDeclaracion(c.ALARM_SERVER_EQUIPOS),
              c.PORT,
              olvido,
            ),
        },
        {
          // F2 (corrección de la 15-L) · el interruptor de la verificación remota.
          provide: CambiarVerificacionRemota,
          inject: [REPOSITORIO_DE_EQUIPOS, CORRECTOR_DE_EQUIPO, OLVIDO_DE_EQUIPO],
          useFactory: (
            equipos: RepositorioDeEquipos,
            corrector: CorrectorDeEquipo,
            olvido: OlvidoDeEquipo,
          ) => new CambiarVerificacionRemota(equipos, corrector, olvido),
        },
        {
          // C1 (15-L) · el proveedor olvida lo que recordaba de un equipo editado;
          // F2 · y también de quién era.
          provide: OLVIDO_DE_EQUIPO,
          inject: [PROVEEDOR_DE_EQUIPOS, CopropiedadDeEquipoEnCache],
          useFactory: (
            proveedor: ProveedorDeEquipos,
            copropiedades: CopropiedadDeEquipoEnCache,
          ): OlvidoDeEquipo => ({
            olvidar: (dispositivoId) => {
              proveedor.olvidar?.(dispositivoId);
              copropiedades.olvidar(dispositivoId);
            },
          }),
        },
        {
          // C3 (15-L) · la señal real de la escucha de cada equipo, para su ficha.
          provide: LECTOR_DE_SENALES,
          inject: [PROVEEDOR_DE_EQUIPOS],
          useFactory: (proveedor: ProveedorDeEquipos): LectorDeSenales => ({
            senal: (dispositivoId) => proveedor.senalDeEventos?.(dispositivoId) ?? null,
          }),
        },
        {
          provide: SONDA_DE_EQUIPO,
          inject: [BITACORA, CONFIGURACION],
          useFactory: (bitacora: Bitacora, c: Configuracion) =>
            // D2 · C3 (15-L) · «Probar conexión» pregunta también el video (RTSP).
            new SondaPorProveedor(undefined, bitacora, c.VIDEO_PUERTO_RTSP),
        },
        {
          // 15-L · la apertura sin plataforma y el plazo, del `.env`: nunca del código.
          provide: CORRECTOR_DE_EQUIPO,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) =>
            new CorrectorPorProveedor(undefined, {
              abrirSinPlataforma: c.TERMINAL_ABRE_SIN_PLATAFORMA,
              ...(c.TERMINAL_PLAZO_DE_VERIFICACION_S === undefined
                ? {}
                : { plazoS: c.TERMINAL_PLAZO_DE_VERIFICACION_S }),
            }),
        },
        // D-11 · atestaciones: PostgreSQL con base; sin ella, el doble de la suite.
        RepositorioDeAtestacionesEnMemoria,
        {
          provide: REPOSITORIO_DE_ATESTACIONES,
          inject: [Pool, CONFIGURACION, RepositorioDeAtestacionesEnMemoria],
          useFactory: (
            pool: Pool,
            c: Configuracion,
            enMemoria: RepositorioDeAtestacionesEnMemoria,
          ) =>
            c.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new RepositorioDeAtestacionesPg(pool)
              : enMemoria,
        },
        {
          provide: RegistrarAtestacionDelInstalador,
          inject: [REPOSITORIO_DE_EQUIPOS, REPOSITORIO_DE_ATESTACIONES, BITACORA],
          useFactory: (
            equipos: RepositorioDeEquipos,
            atestaciones: RepositorioDeAtestaciones,
            bitacora: Bitacora,
          ) => new RegistrarAtestacionDelInstalador(equipos, atestaciones, bitacora),
        },
        {
          provide: REPOSITORIO_DE_EQUIPOS,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion) =>
            new RepositorioDeEquiposPg(pool, c.EQUIPOS_LLAVE, c.EQUIPOS_LLAVE_REF),
        },
        {
          // A4 · lo que el receptor de equipos pregunta: a quién escuchar.
          provide: EQUIPOS_QUE_EMITEN,
          inject: [REPOSITORIO_DE_EQUIPOS],
          useFactory: (equipos: RepositorioDeEquipos) => ({
            activos: () => equipos.activosQueEmiten(),
          }),
        },
        {
          // C4 (15-L) · a quién tomarle el latido: a todos los activos.
          provide: EQUIPOS_ACTIVOS,
          inject: [REPOSITORIO_DE_EQUIPOS],
          useFactory: (equipos: RepositorioDeEquipos) => ({ activos: () => equipos.activos() }),
        },
        {
          // R1 (15-L) · lo que el receptor pregunta: de quién es este equipo.
          // F2 · desde la caché de arriba.
          provide: COPROPIEDAD_DE_EQUIPO,
          useExisting: CopropiedadDeEquipoEnCache,
        },
        {
          // 15-L · el equipo de la petición es de la copropiedad de la ruta.
          provide: ALCANCE_DE_EQUIPOS,
          inject: [REPOSITORIO_DE_EQUIPOS, REGISTRO_AUDITORIA, BITACORA],
          useFactory: (
            equipos: RepositorioDeEquipos,
            auditoria: RegistroDeAuditoria,
            bitacora: Bitacora,
          ) => new AlcanceDeEquipos(equipos, auditoria, bitacora),
        },
        {
          // A3 · lo que biometría pregunta: a qué equipos llega una plantilla.
          provide: TERMINALES_DE_ROSTROS,
          inject: [REPOSITORIO_DE_EQUIPOS],
          useFactory: (equipos: RepositorioDeEquipos) =>
            new TerminalesDeRostrosDesdeRegistro(equipos),
        },
      ],
      exports: [
        REPOSITORIO_DE_EQUIPOS,
        TERMINALES_DE_ROSTROS,
        EQUIPOS_QUE_EMITEN,
        EQUIPOS_ACTIVOS,
        COPROPIEDAD_DE_EQUIPO,
        ALCANCE_DE_EQUIPOS,
      ],
    };
  }
}
