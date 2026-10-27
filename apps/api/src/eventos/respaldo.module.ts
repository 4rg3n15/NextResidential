import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, CORREO_SALIENTE, RELOJ } from '@ncr/domain-core';
import type { Bitacora, CorreoSaliente, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { configuracionDeCorreo } from '../configuracion/esquema-de-correo';
import { REPOSITORIO_EVENTOS } from './aplicacion/puertos';
import type { RepositorioEventos } from './aplicacion/puertos';
import { ResolutorDeNombresSinBase } from './aplicacion/nombres-de-eventos';
import { ConsultarRespaldos } from './aplicacion/respaldo/consultar-respaldos';
import { EnviarRespaldos } from './aplicacion/respaldo/enviar-respaldos';
import { GenerarRespaldo } from './aplicacion/respaldo/generar-respaldo';
import {
  ALMACEN_DE_RESPALDOS,
  DESTINATARIOS_DEL_RESPALDO,
  ENVIOS_DE_RESPALDO,
  FORMATO_DEL_RESPALDO,
  REPOSITORIO_DE_RESPALDOS,
} from './aplicacion/respaldo/puertos';
import type {
  AlmacenDeRespaldos,
  DestinatariosDelRespaldo,
  EnviosDeRespaldo,
  FormatoDelRespaldo,
  RepositorioDeRespaldos,
} from './aplicacion/respaldo/puertos';
import { RespaldarEventos } from './aplicacion/respaldo/respaldar-eventos';
import { AlmacenDeRespaldosSupabase } from './infraestructura/almacen-de-respaldos-supabase';
import { CorreoSmtp } from './infraestructura/correo-smtp';
import {
  AlmacenDeRespaldosEnMemoria,
  CorreoSinConfigurar,
  DestinatariosSinBase,
  EnviosDeRespaldoEnMemoria,
  RepositorioDeRespaldosEnMemoria,
} from './infraestructura/respaldo-en-memoria';
import {
  DestinatariosDelRespaldoPg,
  EnviosDeRespaldoPg,
  RepositorioDeRespaldosPg,
} from './infraestructura/respaldo-pg';
import { ResolutorDeNombresPg } from './infraestructura/resolutor-de-nombres-pg';
import { formatoDelRespaldoEnExcel } from './presentacion/formato-del-respaldo';
import { RespaldosController } from './presentacion/respaldos.controller';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-147 · LA RAÍZ DE COMPOSICIÓN DEL RESPALDO DIARIO DE LOS EVENTOS
 *
 * Módulo aparte y no dentro de `EventosModule`, que pasa de 500 líneas. Lee
 * `eventos` por `REPOSITORIO_EVENTOS`, que `EventosModule` exporta: la misma
 * instancia que sirve la consola, nunca una segunda.
 *
 * **En base o en memoria, las dos cosas a la vez.** La constancia (las filas)
 * y el fichero (el bucket) van juntos: con las filas en la base y el fichero
 * en memoria, un reinicio dejaría días «respaldados» sin fichero que enviar ni
 * descargar. Por eso se usa la base y Storage sólo cuando están las dos —el
 * histórico en PostgreSQL y Storage en uso (`EVIDENCIA_BUCKET` declarada)—;
 * si no, todo en memoria, y el arranque lo declara SIN CONFIGURAR.
 * [SUPUESTO] S-147-04: `EVIDENCIA_BUCKET` es la señal de que el despliegue usa
 * Supabase Storage; el bucket del respaldo lo crea la 0061 con nombre fijo.
 *
 * El correo: SMTP si las cinco `CORREO_*` están; si no, «sin configurar».
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const respaldoEnBase = (c: Configuracion): boolean =>
  c.PERSISTENCIA_DE_EVENTOS === 'postgres' && c.EVIDENCIA_BUCKET !== undefined;

@Module({})
export class RespaldoDeEventosModule {
  static registrar(): DynamicModule {
    return {
      module: RespaldoDeEventosModule,
      controllers: [RespaldosController],
      providers: [
        {
          provide: REPOSITORIO_DE_RESPALDOS,
          inject: [CONFIGURACION, Pool, RELOJ],
          useFactory: (c: Configuracion, pool: Pool, reloj: Reloj): RepositorioDeRespaldos =>
            respaldoEnBase(c)
              ? new RepositorioDeRespaldosPg(pool)
              : new RepositorioDeRespaldosEnMemoria(() => reloj.ahora()),
        },
        {
          provide: ENVIOS_DE_RESPALDO,
          inject: [REPOSITORIO_DE_RESPALDOS, Pool, RELOJ],
          useFactory: (
            respaldos: RepositorioDeRespaldos,
            pool: Pool,
            reloj: Reloj,
          ): EnviosDeRespaldo =>
            // En memoria, los envíos comprueban sus respaldos en la MISMA instancia.
            respaldos instanceof RepositorioDeRespaldosEnMemoria
              ? new EnviosDeRespaldoEnMemoria(respaldos, () => reloj.ahora())
              : new EnviosDeRespaldoPg(pool),
        },
        {
          provide: ALMACEN_DE_RESPALDOS,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion): AlmacenDeRespaldos =>
            respaldoEnBase(c)
              ? new AlmacenDeRespaldosSupabase({
                  supabaseUrl: c.SUPABASE_URL,
                  llaveSecreta: c.SUPABASE_SECRET_KEY,
                })
              : new AlmacenDeRespaldosEnMemoria(),
        },
        {
          provide: DESTINATARIOS_DEL_RESPALDO,
          inject: [CONFIGURACION, Pool],
          useFactory: (c: Configuracion, pool: Pool): DestinatariosDelRespaldo =>
            respaldoEnBase(c) ? new DestinatariosDelRespaldoPg(pool) : new DestinatariosSinBase(),
        },
        {
          provide: CORREO_SALIENTE,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion): CorreoSaliente => {
            const smtp = configuracionDeCorreo(c);
            return smtp === null ? new CorreoSinConfigurar() : new CorreoSmtp(smtp);
          },
        },
        { provide: FORMATO_DEL_RESPALDO, useValue: formatoDelRespaldoEnExcel },
        {
          provide: GenerarRespaldo,
          inject: [
            REPOSITORIO_EVENTOS,
            CONFIGURACION,
            Pool,
            FORMATO_DEL_RESPALDO,
            ALMACEN_DE_RESPALDOS,
            REPOSITORIO_DE_RESPALDOS,
          ],
          useFactory: (
            eventos: RepositorioEventos,
            c: Configuracion,
            pool: Pool,
            formato: FormatoDelRespaldo,
            almacen: AlmacenDeRespaldos,
            respaldos: RepositorioDeRespaldos,
          ) =>
            new GenerarRespaldo(
              eventos,
              c.PERSISTENCIA_DE_EVENTOS === 'postgres'
                ? new ResolutorDeNombresPg(pool)
                : new ResolutorDeNombresSinBase(),
              formato,
              almacen,
              respaldos,
            ),
        },
        {
          provide: EnviarRespaldos,
          inject: [
            ENVIOS_DE_RESPALDO,
            ALMACEN_DE_RESPALDOS,
            DESTINATARIOS_DEL_RESPALDO,
            CORREO_SALIENTE,
            RELOJ,
          ],
          useFactory: (
            envios: EnviosDeRespaldo,
            almacen: AlmacenDeRespaldos,
            destinatarios: DestinatariosDelRespaldo,
            correo: CorreoSaliente,
            reloj: Reloj,
          ) => new EnviarRespaldos(envios, almacen, destinatarios, correo, reloj),
        },
        {
          provide: RespaldarEventos,
          inject: [REPOSITORIO_DE_RESPALDOS, GenerarRespaldo, EnviarRespaldos, RELOJ, BITACORA],
          useFactory: (
            respaldos: RepositorioDeRespaldos,
            generar: GenerarRespaldo,
            enviar: EnviarRespaldos,
            reloj: Reloj,
            bitacora: Bitacora,
          ) => new RespaldarEventos(respaldos, generar, enviar, reloj, bitacora),
        },
        {
          provide: ConsultarRespaldos,
          inject: [REPOSITORIO_DE_RESPALDOS, ENVIOS_DE_RESPALDO, ALMACEN_DE_RESPALDOS],
          useFactory: (
            respaldos: RepositorioDeRespaldos,
            envios: EnviosDeRespaldo,
            almacen: AlmacenDeRespaldos,
          ) => new ConsultarRespaldos(respaldos, envios, almacen),
        },
      ],
      exports: [RespaldarEventos, CORREO_SALIENTE],
    };
  }
}
