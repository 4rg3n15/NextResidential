import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { IngestaController } from './presentacion/ingesta.controller';
import { GuardiaDeFirmaDeIngesta } from './presentacion/guardia-firma';

/**
 * Módulo de autorizaciones. En esta etapa expone la ingesta firmada; los casos
 * de uso se cablean contra sus repositorios en la ETAPA 06, cuando exista el
 * adaptador de persistencia de eventos. Se registran ahora los que no dependen
 * de la base para que la frontera esté puesta desde el principio.
 */
@Module({})
export class AutorizacionesModule {
  static registrar(): DynamicModule {
    return {
      module: AutorizacionesModule,
      controllers: [IngestaController],
      providers: [GuardiaDeFirmaDeIngesta],
    };
  }
}
