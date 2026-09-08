import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { IngestaController } from './presentacion/ingesta.controller';
import { GuardiaDeFirmaDeIngesta } from './presentacion/guardia-firma';

/**
 * Módulo de autorizaciones. Expone la ingesta firmada, que desde la ETAPA 06
 * decide y registra el evento: los casos de uso que necesita —`RegistrarAcceso`
 * y el repositorio de dispositivos— los aporta `EventosModule`, que es
 * `@Global`, así que aquí no hay que importarlo ni conocer su cableado.
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
