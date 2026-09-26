import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { AutenticacionModule } from './autenticacion';
import { GuardaDeAutenticacion } from './comun/guardas/autenticacion.guard';
import { GuardaDeRoles } from './comun/guardas/roles.guard';
import { GuardaDeCambioDeContrasena } from './comun/guardas/cambio-de-contrasena.guard';
import { BitacoraDeIdentidadModule } from './comun/bitacora-de-identidad';
import { CuentasModule, limitadoresDeAcceso } from './cuentas';
import { GuardaDeTurnoDePorteria, PorteriaModule } from './porteria';
import { MultiempresaModule } from './multiempresa/multiempresa.module';
import { PoolModule } from './persistencia/pool.module';
import { PadronModule } from './padron';
import { AutorizacionesModule } from './autorizaciones';
import { EventosModule } from './eventos';
import { ZonasModule } from './zonas';
import { ProveedoresModule } from './proveedores';
import { BiometriaModule } from './biometria';
import { TableroModule } from './tablero';
import { ResidenteModule } from './residente';
import { limitadorPorDispositivo } from './eventos';
import { InterceptorDeCorrelacion } from './comun/interceptores/correlacion';
import type { Configuracion } from './configuracion/esquema';
import { NucleoModule } from './nucleo/nucleo.module';
import { ObservabilidadModule } from './observabilidad';
import { VERSION_API } from './version';
import { SaludController } from './salud/salud.controller';
import { SONDA_POSTGRES, SondaDePostgresPg } from './arranque/sonda-postgres';
/**
 * **La última importación del bloque, y no por orden alfabético** (DT-13).
 *
 * El barril de `guardia` alcanza el de `eventos`, que alcanza el de
 * `autorizaciones`, que alcanza `IngestaController`, que vuelve a `eventos`. Si
 * esta línea se coloca antes, ese ciclo se resuelve con `RegistrarAcceso`
 * todavía sin definir y Nest falla con «argument Function at index [1]», que no
 * dice nada de la causa. Colocada aquí, `eventos` y `autorizaciones` ya están
 * evaluados cuando `guardia` los mira.
 *
 * Es un apaño de orden y se declara como tal: la salida de verdad es que el
 * puerto de auditoría y el de escalamiento vivan en el núcleo compartido, que
 * es lo que DT-13 dejó escrito.
 */
import { GuardiaModule } from './guardia';
import { AlarmServerModule } from './alarmserver';
import { PlanificacionModule } from './planificacion';
import { EquiposModule, RegistroDeEquiposPg } from './equipos';

/**
 * El límite de peticiones es GLOBAL desde el primer día (§2.7.5). Ponerlo solo
 * en las rutas «sensibles» deja fuera las que aún no existen; el endurecimiento
 * por ruta se suma encima en la ETAPA 03.
 */
@Module({})
export class AppModule {
  static conConfiguracion(config: Configuracion): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfiguracionModule.conValores(config),
        NucleoModule,
        /**
         * ETAPA 14 · justo después del núcleo, porque es `@Global` y provee el
         * puerto de métricas que consumen tanto el interceptor de latencias
         * —fuera de todo módulo de negocio— como `EscalarAlerta`, dentro de
         * uno. Un proveedor global alcanza a lo que se registra DESPUÉS: el
         * orden es funcional, igual que el de `MultiempresaModule` de abajo.
         */
        ObservabilidadModule.registrar({
          ...(config.SENTRY_DSN === undefined ? {} : { sentryDsn: config.SENTRY_DSN }),
          entorno: config.NODE_ENV,
          version: VERSION_API,
          ventana: config.METRICAS_VENTANA,
        }),
        /**
         * **`MultiempresaModule` va ANTES de `AutenticacionModule`, y el orden
         * es funcional: no lo toque sin leer esto.**
         *
         * `AutenticacionController` inyecta `REGISTRO_AUDITORIA`, que este
         * módulo provee y exporta siendo `@Global()`. Ser global no basta: un
         * proveedor global alcanza a lo que se registra DESPUÉS. Con el orden
         * anterior el proceso no arrancaba —«Nest can't resolve dependencies of
         * the AutenticacionController»— mientras las 363 pruebas seguían en
         * verde, porque `Test.createTestingModule` envuelve `AppModule` en un
         * módulo raíz propio y allí los globales alcanzan a todo.
         *
         * El import explícito sería más robusto que el orden, pero cierra un
         * ciclo de `require`: `multiempresa/respuestas.ts` toma `ROLES` del
         * barril de `autenticacion`, y con las dos flechas el enumerado llega
         * `undefined` en tiempo de carga. Queda declarado como DT-13, con la
         * salida escrita: el puerto de auditoría pertenece al núcleo
         * compartido, no a `multiempresa`.
         *
         * Lo que impide que esto vuelva a pasar no es este comentario: es el
         * paso «la API arranca de verdad» de `verificar-etapa.sh`, que ejecuta
         * el proceso compilado y le pide `/health`.
         */
        /**
         * **Antes que todo lo que consulta la base** (D-66). Es `@Global` y
         * provee el ÚNICO `Pool` del proceso: hasta la 09-B cada módulo abría
         * el suyo y el tope real —35 conexiones— era la suma de tres decisiones
         * que nadie había tomado junta.
         */
        PoolModule.registrar(),
        /**
         * ETAPA 15-H · el rastro de identidad y portería (ADR-024). Global y
         * antes de sus dos escritores —cuentas y portería—, que se registran
         * después: el mismo argumento de orden que el del `Pool`.
         */
        BitacoraDeIdentidadModule.registrar(),
        /**
         * ETAPA 15-C · el ÚNICO punto de composición de los proveedores de
         * hardware, y antes que cualquiera de sus consumidores.
         *
         * Es `@Global`, así que va aquí y no dentro de quien lo usa: biometría
         * sincroniza plantillas, guardia abre puertas y el receptor publica
         * placas, y los tres tienen que ver **la misma instancia**. Con una por
         * módulo habría cuatro conjuntos de plantillas y una supresión que no
         * suprime la que la terminal tiene.
         *
         * Cambiar `PROVEEDOR_DE_EQUIPOS` del adaptador simulado al real no
         * toca una línea de dominio, aplicación ni interfaz: ésa es la
         * verificación de OE-03 y de ADR-03, y ahora hay dónde hacerla.
         */
        ProveedoresModule.registrar({
          clase: config.PROVEEDOR_DE_EQUIPOS,
          semilla: config.PROVEEDOR_SEMILLA,
          // D5 · con el adaptador real, el registro lee `dispositivos` y descifra
          // el sobre de la credencial. Antes no había registro y la API no
          // arrancaba en modo hardware.
          registroDesde: ({ pool, configuracion }) =>
            new RegistroDeEquiposPg(pool, configuracion.EQUIPOS_LLAVE),
        }),
        MultiempresaModule,
        AutenticacionModule.registrar(),
        /**
         * ETAPA 15-H (ADR-023) · cuentas por usuario y primer ingreso. Después
         * de autenticación, de la que lee el verificador de tokens, y antes de
         * portería, que crea cuentas e inscribe su gancho de sesión.
         */
        CuentasModule.registrar(),
        /**
         * ETAPA 15-H (ADR-024) · portería: porteros, turnos, sesiones y
         * patrullaje. Después de cuentas —crea sus cuentas y se inscribe en su
         * registro de ganchos— y de multiempresa, de cuyo catálogo lee la zona
         * horaria de cada copropiedad.
         */
        PorteriaModule.registrar(),
        PadronModule.registrar(),
        ZonasModule.registrar(),
        BiometriaModule.registrar(),
        EventosModule.registrar(),
        AutorizacionesModule.registrar(),
        // Después de eventos y autorizaciones: la guardia lee la cola del
        // repositorio de eventos y escala por el mismo camino que la ingesta.
        GuardiaModule.registrar(),
        /**
         * ETAPA 15 · el receptor del «servidor de alarma».
         *
         * Después de `eventos` y `guardia` porque consume el caso de uso de
         * uno y el accionador del otro por sus barriles. Sin equipos
         * declarados no acredita a nadie y el extremo queda cerrado, que es
         * la configuración por omisión y la dirección segura.
         */
        AlarmServerModule.registrar(config.ALARM_SERVER_EQUIPOS),
        // Después de eventos: el tablero lee por los puertos que aquel publica.
        TableroModule.registrar(),
        /**
         * ETAPA 15-B · el alta de equipos desde la consola. Después del
         * tablero, que es quien los muestra: el panel lee el inventario y este
         * módulo lo escribe, y el orden deja claro cuál depende de cuál.
         */
        EquiposModule.registrar(),
        // La superficie del residente, después del padrón: lee por su propio
        // puerto y no entra en el de administración (ver `mi.controller.ts`).
        ResidenteModule.registrar(),
        /**
         * EL ÚLTIMO de los de negocio (ETAPA 14). Toma un caso de uso de
         * eventos, uno de zonas y uno de biometría por sus barriles, y un
         * módulo no puede inyectar lo que todavía no se ha registrado. Es el
         * mismo argumento de orden que el de `MultiempresaModule`, arriba.
         */
        PlanificacionModule.registrar({
          cadenaDeConexion: config.DATABASE_URL,
          esquema: config.PGBOSS_SCHEMA,
          // En pruebas NUNCA: una suite que levanta veinte aplicaciones abriría
          // veinte conexiones de pg-boss contra una base que no existe.
          habilitado: config.PLANIFICADOR_HABILITADO && config.NODE_ENV !== 'test',
        }),
        // Dos limitadores con NOMBRE, y cada uno cuenta por lo suyo: `default`
        // por IP —el de siempre— y `dispositivo` por equipo firmante (D-28).
        // Uno solo no sirve: en la ingesta todos los equipos comparten IP, y el
        // tope por IP los suma a todos. La prueba de carga lo demostró.
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: config.THROTTLE_TTL_SEGUNDOS * 1000,
            limit: config.THROTTLE_LIMITE,
          },
          limitadorPorDispositivo(config.THROTTLE_DISPOSITIVO_LIMITE),
          // ETAPA 15-H (S-50) · el inicio de sesión cuenta también por cuenta y
          // por el origen que declara la consola. Sólo en su ruta (`skipIf`).
          ...limitadoresDeAcceso(),
        ]),
      ],
      controllers: [SaludController],
      providers: [
        // El ORDEN importa y es deliberado: límite → autenticación → roles.
        // Poner el throttler primero hace que un ataque de fuerza bruta se
        // corte ANTES de verificar firmas, que es la parte cara.
        // La sonda de la base se registra aquí, junto al controlador de salud
        // que la consulta, y no dentro de un módulo de dominio: `/ready` no
        // pertenece a ningún módulo de negocio.
        {
          provide: SONDA_POSTGRES,
          useValue: new SondaDePostgresPg(config.DATABASE_POOLER_URL),
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GuardaDeAutenticacion },
        { provide: APP_GUARD, useClass: GuardaDeRoles },
        // ETAPA 15-H (ADR-023) · después de roles: una ruta que el rol no
        // alcanza responde por su rol; una que sí, por el cambio pendiente.
        { provide: APP_GUARD, useClass: GuardaDeCambioDeContrasena },
        // ETAPA 15-H (ADR-024) · la última: turno vigente y patrullaje del
        // portero, consultados en CADA petición con el reloj inyectado.
        { provide: APP_GUARD, useClass: GuardaDeTurnoDePorteria },
        InterceptorDeCorrelacion,
      ],
    };
  }
}
