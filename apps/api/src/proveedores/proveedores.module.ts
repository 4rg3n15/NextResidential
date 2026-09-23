import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import {
  ACCESS_POINT_PROVIDER,
  FACE_TEMPLATE_PROVIDER,
  INTERCOM_PROVIDER,
  PLATE_EVENT_SOURCE,
  RELOJ,
} from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { crearProveedorDeEquipos } from '@ncr/providers';
import type { ClaseDeProveedor, ProveedorDeEquipos, RegistroDeEquipos } from '@ncr/providers';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN DE LOS PROVEEDORES · ETAPA 15-C
 *
 * ADR-03 dice que el hardware va al final y que eso es una prueba: cambiar de
 * adaptador no debe tocar nada más. Hasta hoy **no se podía comprobar**, porque
 * no había dónde: el módulo de biometría hacía `new MockProvider` dentro de su
 * propia fábrica, así que «cambiar de proveedor» significaba editar un módulo
 * de la API — exactamente lo que el ADR prohíbe.
 *
 * Este módulo es ese sitio, y es el **único**. Los cuatro puertos se resuelven
 * de una sola instancia, porque es **un equipo**: el estado que comparten —qué
 * dispositivos existen, qué canal de audio está ocupado— es el mismo estado, y
 * separarlo obligaría a sincronizar cuatro copias de la verdad.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES `@Global` A PROPÓSITO, Y NO POR COMODIDAD
 *
 * Los cuatro puertos los consumen módulos que no se conocen entre sí —biometría
 * sincroniza plantillas, guardia abre puertas, el receptor publica placas—. Sin
 * `@Global`, cada uno tendría que importar este módulo, y **el primero que se
 * olvidara volvería a construirse el suyo**: dos instancias, dos conjuntos de
 * plantillas, y una supresión que no suprime la que la terminal tiene.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA VERIFICACIÓN DE OE-03, EN UNA FRASE
 *
 * Cambiar `PROVEEDOR_DE_EQUIPOS` del adaptador simulado al real no toca una
 * línea de dominio, de aplicación ni de interfaz. Si obligara a tocarlas, sería
 * un defecto de diseño de las etapas anteriores y habría que pararse y
 * reportarlo.
 */
@Global()
@Module({})
export class ProveedoresModule {
  static registrar(opciones: {
    readonly clase: ClaseDeProveedor;
    readonly registro?: RegistroDeEquipos;
    /** Semilla del simulado: la adversidad tiene que ser reproducible. */
    readonly semilla?: number;
  }): DynamicModule {
    /**
     * Token intermedio, y no cuatro fábricas: con cuatro habría cuatro
     * instancias. Es el mismo defecto que ya obligó a que el almacén de
     * plantillas fuese un proveedor propio en vez de un `new` dentro de otra
     * fábrica, y la misma solución.
     */
    const PROVEEDOR = Symbol.for('ncr.proveedores.Instancia');

    const alias = [
      ACCESS_POINT_PROVIDER,
      PLATE_EVENT_SOURCE,
      FACE_TEMPLATE_PROVIDER,
      INTERCOM_PROVIDER,
    ].map((token) => ({
      provide: token,
      inject: [PROVEEDOR],
      useFactory: (proveedor: ProveedorDeEquipos) => proveedor,
    }));

    return {
      module: ProveedoresModule,
      providers: [
        {
          provide: PROVEEDOR,
          inject: [RELOJ],
          useFactory: (reloj: Reloj) =>
            crearProveedorDeEquipos({
              clase: opciones.clase,
              reloj,
              ...(opciones.registro === undefined ? {} : { registro: opciones.registro }),
              ...(opciones.semilla === undefined ? {} : { semilla: opciones.semilla }),
            }),
        },
        ...alias,
      ],
      exports: [
        PROVEEDOR,
        ACCESS_POINT_PROVIDER,
        PLATE_EVENT_SOURCE,
        FACE_TEMPLATE_PROVIDER,
        INTERCOM_PROVIDER,
      ],
    };
  }
}
