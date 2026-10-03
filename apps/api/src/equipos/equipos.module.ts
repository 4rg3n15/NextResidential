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
  RECEPTOR_ESPERADO,
} from './aplicacion/puertos';
import type {
  CorrectorDeEquipo,
  OlvidoDeEquipo,
  ResolutorDeReceptorEsperado,
} from './aplicacion/puertos';
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
import { CopropiedadDeEquipoEnCache } from './infraestructura/copropiedad-de-equipo-en-cache';
import { IpDelMacPorInterfaces, SecretosPropiosODeclarados } from './infraestructura/ip-del-mac';
import { SECRETOS_DE_ALARM_SERVER } from './aplicacion/secretos-de-alarm-server';
import type { SecretosDeAlarmServer } from './aplicacion/secretos-de-alarm-server';
import {
  CambiarVerificacionRemota,
  DesactivarReceptorHuerfano,
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
import { REPOSITORIO_DE_PUNTOS } from './aplicacion/puntos-de-acceso';
import type { RepositorioDePuntos } from './aplicacion/puntos-de-acceso';
import { LECTOR_DE_SALIDAS, SalidasDelEquipo } from './aplicacion/salidas-del-equipo';
import type { LectorDeSalidas } from './aplicacion/salidas-del-equipo';
import { PuntosDeOperacion } from './aplicacion/puntos-de-operacion';
import { RepositorioDePuntosPg } from './infraestructura/puntos-de-acceso-pg';
import { RepositorioDePuntosEnMemoria } from './infraestructura/puntos-de-acceso-en-memoria';
import { LectorDeSalidasPorProveedor } from './infraestructura/lector-de-salidas-por-proveedor';
import { SalidasController } from './presentacion/salidas.controller';
import type { RegistroDeAuditoria } from '../comun/auditoria';
import * as conEdge from './infraestructura/composicion-con-edge';

/**
 * Raíz de composición del aprovisionamiento de equipos.
 *
 * La sonda es un PUERTO y no una llamada directa: es lo que permite que la
 * suite pruebe los cuatro resultados —alcanzado, decide por su cuenta,
 * credencial rechazada, inalcanzable— **sin un solo equipo y sin red** (ADR-03),
 * y lo que permitirá mañana sondear otro fabricante sin tocar el controlador.
 */
@Module({})
export class EquiposModule {
  private static unico: DynamicModule | undefined; // 15-U · Nest 11 deduplica por referencia
  static registrar(): DynamicModule {
    return (EquiposModule.unico ??= {
      module: EquiposModule,
      controllers: [
        EquiposController,
        AtestacionesController,
        NombresDeEquiposController,
        ConfiguracionEnSitioController,
        EquiposSimuladosController,
        SalidasController,
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
          inject: [
            REPOSITORIO_DE_EQUIPOS,
            CORRECTOR_DE_EQUIPO,
            CONFIGURACION,
            OLVIDO_DE_EQUIPO,
            SECRETOS_DE_ALARM_SERVER,
          ],
          useFactory: (
            equipos: RepositorioDeEquipos,
            corrector: CorrectorDeEquipo,
            c: Configuracion,
            olvido: OlvidoDeEquipo,
            propios: SecretosDeAlarmServer,
          ) =>
            new EnviarEventosAEsteMac(
              equipos,
              corrector,
              new IpDelMacPorInterfaces(c.ALARM_SERVER_IP_ANUNCIADA),
              // C6 (15-M) · el secreto PROPIO de la cámara (emitido en el alta)
              // manda; la declaración del .env queda de respaldo; sin ninguno,
              // se emite uno aquí mismo (cámaras anteriores a la 0045).
              new SecretosPropiosODeclarados(propios, c.ALARM_SERVER_EQUIPOS),
              c.PORT,
              olvido,
            ),
        },
        {
          /**
           * C6 (15-M) · el secreto de Alarm Server de cada cámara: emitido en el
           * alta, cifrado en `dispositivos` (0045) con la bóveda de equipos, y
           * buscado por huella cuando la cámara publica. En memoria sólo sin
           * base (la suite), como las atestaciones.
           */
          provide: SECRETOS_DE_ALARM_SERVER,
          inject: [Pool, CONFIGURACION, conEdge.CON_EDGE],
          useFactory: conEdge.secretosDeAlarmServer,
        },
        {
          // E4 (15-M) · 7 · a dónde debería publicar un equipo: IP del Mac hacia él + PORT.
          provide: RECEPTOR_ESPERADO,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion): ResolutorDeReceptorEsperado => {
            const ips = new IpDelMacPorInterfaces(c.ALARM_SERVER_IP_ANUNCIADA);
            return {
              hacia: (host) => {
                const ip = ips.hacia(host);
                return ip.ip === null
                  ? { ip: null, motivo: ip.motivo, puerto: c.PORT }
                  : { ip: ip.ip, puerto: c.PORT };
              },
            };
          },
        },
        {
          // E4 (15-M) · «Desactivar el receptor huérfano» de terminal y videoportero.
          provide: DesactivarReceptorHuerfano,
          inject: [REPOSITORIO_DE_EQUIPOS, CORRECTOR_DE_EQUIPO, OLVIDO_DE_EQUIPO],
          useFactory: (
            equipos: RepositorioDeEquipos,
            corrector: CorrectorDeEquipo,
            olvido: OlvidoDeEquipo,
          ) => new DesactivarReceptorHuerfano(equipos, corrector, olvido),
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
          inject: [BITACORA, CONFIGURACION, conEdge.CON_EDGE],
          useFactory: conEdge.sondaDeEquipo,
        },
        {
          provide: CORRECTOR_DE_EQUIPO,
          inject: [CONFIGURACION, conEdge.CON_EDGE],
          useFactory: conEdge.correctorDeEquipo,
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
          inject: [Pool, CONFIGURACION, conEdge.CON_EDGE],
          useFactory: conEdge.repositorioDeEquipos,
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
        /**
         * 15-P · P3 · las salidas del videoportero: se LEEN por el proveedor
         * (`salidasDe`, opcional: un proveedor que no sabe leerlas dice `null`)
         * y se persisten en `puntos_de_acceso` con el histórico; sin base, en
         * el proceso, como las atestaciones.
         */
        {
          provide: REPOSITORIO_DE_PUNTOS,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion): RepositorioDePuntos =>
            c.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new RepositorioDePuntosPg(pool)
              : new RepositorioDePuntosEnMemoria(),
        },
        {
          provide: LECTOR_DE_SALIDAS,
          inject: [PROVEEDOR_DE_EQUIPOS],
          useFactory: (proveedor: ProveedorDeEquipos): LectorDeSalidas =>
            new LectorDeSalidasPorProveedor(proveedor),
        },
        {
          provide: SalidasDelEquipo,
          inject: [REPOSITORIO_DE_EQUIPOS, REPOSITORIO_DE_PUNTOS, LECTOR_DE_SALIDAS, RELOJ],
          useFactory: (
            equipos: RepositorioDeEquipos,
            puntos: RepositorioDePuntos,
            lector: LectorDeSalidas,
            reloj: Reloj,
          ) => new SalidasDelEquipo(equipos, puntos, lector, reloj),
        },
        {
          provide: PuntosDeOperacion,
          inject: [REPOSITORIO_DE_PUNTOS],
          useFactory: (puntos: RepositorioDePuntos) => new PuntosDeOperacion(puntos),
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
        LECTOR_DE_SENALES,
        REPOSITORIO_DE_EQUIPOS,
        SECRETOS_DE_ALARM_SERVER,
        TERMINALES_DE_ROSTROS,
        EQUIPOS_QUE_EMITEN,
        EQUIPOS_ACTIVOS,
        COPROPIEDAD_DE_EQUIPO,
        ALCANCE_DE_EQUIPOS,
        PuntosDeOperacion,
      ],
    });
  }
}
