import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { ProveedorDeJwks } from './infraestructura/jwks';
import { FactoresSupabase } from './infraestructura/factores-supabase';
import { RepositorioCodigosMfaEnMemoria } from './infraestructura/codigos-mfa-en-memoria';
import { ADMINISTRADOR_DE_FACTORES, REPOSITORIO_CODIGOS_MFA } from './aplicacion/puertos';
import { VerificadorDeJwt } from './infraestructura/verificador-jwt';
import { AutenticacionController } from './presentacion/autenticacion.controller';

/**
 * El emisor se DERIVA de `SUPABASE_URL` en vez de pedirse como variable aparte.
 * Dos variables que deben coincidir acaban divergiendo, y una discrepancia aquí
 * significa aceptar tokens de otro proyecto.
 */
export const emisorDe = (supabaseUrl: string): string =>
  `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;

@Global()
@Module({})
export class AutenticacionModule {
  static registrar(): DynamicModule {
    return {
      module: AutenticacionModule,
      controllers: [AutenticacionController],
      providers: [
        // Adaptador en memoria mientras no haya contraseña de PostgreSQL
        // (D-17), igual que en el resto del monolito. Lo que no cambia cuando
        // llegue la credencial es el PUERTO.
        RepositorioCodigosMfaEnMemoria,
        { provide: REPOSITORIO_CODIGOS_MFA, useExisting: RepositorioCodigosMfaEnMemoria },
        {
          provide: ADMINISTRADOR_DE_FACTORES,
          inject: [CONFIGURACION, BITACORA],
          useFactory: (c: Configuracion, b: Bitacora) => new FactoresSupabase(c, b),
        },
        {
          provide: ProveedorDeJwks,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) =>
            new ProveedorDeJwks({
              url: c.SUPABASE_JWKS_URL,
              ttlSegundos: c.JWKS_CACHE_TTL_SEGUNDOS,
              refrescoMinimoSegundos: c.JWKS_REFRESCO_MINIMO_SEGUNDOS,
            }),
        },
        {
          provide: VerificadorDeJwt,
          inject: [ProveedorDeJwks, CONFIGURACION],
          useFactory: (jwks: ProveedorDeJwks, c: Configuracion) =>
            new VerificadorDeJwt(jwks, {
              emisor: emisorDe(c.SUPABASE_URL),
              audiencia: 'authenticated',
              toleranciaRelojSegundos: 60,
            }),
        },
      ],
      exports: [ProveedorDeJwks, VerificadorDeJwt, REPOSITORIO_CODIGOS_MFA, RepositorioCodigosMfaEnMemoria],
    };
  }
}
