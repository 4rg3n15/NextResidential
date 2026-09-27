import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { ALMACEN_EVIDENCIA, BITACORA, RELOJ } from '@ncr/domain-core';
import type { AlmacenEvidencia, Bitacora, Reloj } from '@ncr/domain-core';
import {
  AdjuntarFotografiaDeVisitante,
  CrearAutorizacion,
  REPOSITORIO_AUTORIZACIONES,
  RevocarAutorizacion,
} from '../autorizaciones';
import type { RepositorioAutorizaciones } from '../autorizaciones';
import {
  BiometriaModule,
  CapturarRostro,
  SincronizarPlantillaEnTerminales,
  SuprimirRostroDeAutorizacion,
} from '../biometria';
import { CANAL_TIEMPO_REAL } from '../eventos';
import type { CanalTiempoReal } from '../eventos';
import { AvisoDeVisitas } from './aplicacion/aviso-de-visitas';
import {
  DatosParaVolverAAutorizar,
  FotoDeVisitaEnEquipos,
  ListarVisitas,
  UltimosVisitantes,
  ViviendasParaVisitas,
} from './aplicacion/consultar-visitas';
import { GenerarVisita } from './aplicacion/generar-visita';
import { AlmacenDeFotos } from './aplicacion/lector-de-fotos';
import {
  CONSTANCIA_DE_CASILLA,
  CONSULTA_DE_VISITAS,
  LECTOR_DE_FOTOS_DE_VISITA,
  PERSONAS_DE_VISITA,
} from './aplicacion/puertos';
import type {
  ConsultaDeVisitas,
  ConstanciaDeCasilla,
  LectorDeFotosDeVisita,
  PersonasDeVisita,
} from './aplicacion/puertos';
import { RechazarVisita } from './aplicacion/rechazar-visita';
import { RegistrarRostroDeVisita } from './aplicacion/rostro-de-visita';
import {
  ConstanciaDeCasillaPg,
  ConsultaDeVisitasPg,
  PersonasDeVisitaPg,
} from './infraestructura/visitas-pg';
import { lectorDeFotosDesde } from './infraestructura/lector-de-fotos';
import { VisitasController } from './presentacion/visitas.controller';

/**
 * Raíz de composición de visitas (F, 15-L). Global porque el módulo del
 * residente genera SUS visitas con la misma segunda mitad —foto, casilla,
 * plantilla, equipos— y lee sus últimos visitantes de aquí; se registra antes
 * que él.
 */
@Global()
@Module({})
export class VisitasModule {
  static registrar(): DynamicModule {
    return {
      module: VisitasModule,
      imports: [BiometriaModule.registrar()],
      controllers: [VisitasController],
      providers: [
        {
          provide: PERSONAS_DE_VISITA,
          inject: [Pool],
          useFactory: (pool: Pool) => new PersonasDeVisitaPg(pool),
        },
        {
          provide: CONSTANCIA_DE_CASILLA,
          inject: [Pool],
          useFactory: (pool: Pool) => new ConstanciaDeCasillaPg(pool),
        },
        {
          provide: CONSULTA_DE_VISITAS,
          inject: [Pool],
          useFactory: (pool: Pool) => new ConsultaDeVisitasPg(pool),
        },
        {
          provide: LECTOR_DE_FOTOS_DE_VISITA,
          inject: [ALMACEN_EVIDENCIA],
          useFactory: (almacen: AlmacenEvidencia) => lectorDeFotosDesde(almacen),
        },
        {
          provide: AvisoDeVisitas,
          inject: [CANAL_TIEMPO_REAL, CONSULTA_DE_VISITAS, RELOJ, BITACORA],
          useFactory: (canal: CanalTiempoReal, c: ConsultaDeVisitas, reloj: Reloj, b: Bitacora) =>
            new AvisoDeVisitas(canal, c, reloj, b),
        },
        {
          provide: RegistrarRostroDeVisita,
          inject: [
            AdjuntarFotografiaDeVisitante,
            CapturarRostro,
            SincronizarPlantillaEnTerminales,
            CONSTANCIA_DE_CASILLA,
            RELOJ,
          ],
          useFactory: (
            adjuntar: AdjuntarFotografiaDeVisitante,
            capturar: CapturarRostro,
            enTerminales: SincronizarPlantillaEnTerminales,
            casillas: ConstanciaDeCasilla,
            reloj: Reloj,
          ) => new RegistrarRostroDeVisita(adjuntar, capturar, enTerminales, casillas, reloj),
        },
        {
          provide: GenerarVisita,
          inject: [
            PERSONAS_DE_VISITA,
            CrearAutorizacion,
            RevocarAutorizacion,
            RegistrarRostroDeVisita,
            AvisoDeVisitas,
          ],
          useFactory: (
            personas: PersonasDeVisita,
            crear: CrearAutorizacion,
            revocar: RevocarAutorizacion,
            rostro: RegistrarRostroDeVisita,
            aviso: AvisoDeVisitas,
          ) => new GenerarVisita(personas, crear, revocar, rostro, aviso),
        },
        {
          provide: RechazarVisita,
          inject: [
            RevocarAutorizacion,
            SuprimirRostroDeAutorizacion,
            CONSULTA_DE_VISITAS,
            AvisoDeVisitas,
          ],
          useFactory: (
            revocar: RevocarAutorizacion,
            suprimir: SuprimirRostroDeAutorizacion,
            c: ConsultaDeVisitas,
            aviso: AvisoDeVisitas,
          ) => new RechazarVisita(revocar, suprimir, c, aviso),
        },
        {
          provide: ListarVisitas,
          inject: [CONSULTA_DE_VISITAS, RELOJ],
          useFactory: (c: ConsultaDeVisitas, reloj: Reloj) => new ListarVisitas(c, reloj),
        },
        {
          provide: FotoDeVisitaEnEquipos,
          inject: [CONSULTA_DE_VISITAS],
          useFactory: (c: ConsultaDeVisitas) => new FotoDeVisitaEnEquipos(c),
        },
        {
          provide: ViviendasParaVisitas,
          inject: [CONSULTA_DE_VISITAS],
          useFactory: (c: ConsultaDeVisitas) => new ViviendasParaVisitas(c),
        },
        {
          provide: UltimosVisitantes,
          inject: [CONSULTA_DE_VISITAS],
          useFactory: (c: ConsultaDeVisitas) => new UltimosVisitantes(c),
        },
        {
          provide: DatosParaVolverAAutorizar,
          inject: [CONSULTA_DE_VISITAS, REPOSITORIO_AUTORIZACIONES, LECTOR_DE_FOTOS_DE_VISITA],
          useFactory: (
            c: ConsultaDeVisitas,
            autorizaciones: RepositorioAutorizaciones,
            lector: LectorDeFotosDeVisita,
          ) => new DatosParaVolverAAutorizar(c, new AlmacenDeFotos(autorizaciones, lector)),
        },
      ],
      exports: [
        RegistrarRostroDeVisita,
        AvisoDeVisitas,
        UltimosVisitantes,
        DatosParaVolverAAutorizar,
      ],
    };
  }
}
