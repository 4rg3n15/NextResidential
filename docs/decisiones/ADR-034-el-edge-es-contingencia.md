# ADR-034 · El Edge en sitio es contingencia: la nube habla con los equipos y el Edge decide y acciona sólo cuando la nube no puede

|              |                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**   | **Sustituida en parte por [ADR-035](ADR-035-el-edge-es-el-puente-local-permanente.md)** (15-Q2, 2026-10-02) · aceptada en la 15-Q con P-27 = B, la opción que el agente marcó «Recomendado»; el cliente aclaró que su decisión es A |
| **Completa** | ADR-017 (SQLite del Edge con `node:sqlite`) y la ETAPA 12, cuya DoD partía de «un gateway ya sincronizado» y de hechos que entraban por `POST /hechos`. No sustituye nada: añade lo que la 12 no construyó (S-24)                   |
| **Afecta a** | `apps/edge/src/composicion.ts` · `aplicacion/contingencia-en-sitio.ts` · `aplicacion/descarga-de-reglas.ts` · `infraestructura/http/` · `apps/api/src/edge/` · migración 0049 · `docs/guias/DESPLIEGUE_EDGE.md` · `pnpm sitio:edge` |

> **Sustituida en parte (15-Q2).** El papel del Edge con WAN que describe este
> ADR —la nube habla con los equipos y el Edge sólo actúa sin ella— lo sustituye
> [ADR-035](ADR-035-el-edge-es-el-puente-local-permanente.md): el Edge es el
> puente local permanente. Se conserva como registro de lo construido en la 15-Q;
> lo que sigue vigente está en «Qué se conserva» de ADR-035.

---

## Contexto

La auditoría S-24 encontró que el Edge de la ETAPA 12 **no podía operar en
sitio**: la API no servía la instantánea de reglas, `descargarReglas()` sólo lo
llamaban las pruebas, `POST /hechos` no exigía autenticación y el Edge no se
conectaba a ningún equipo ni accionaba ninguna salida. La DoD se había
demostrado con hechos fabricados contra una caché sembrada a mano.

Para construir lo que faltaba había que decidir **qué papel tiene el Edge
cuando hay WAN**, y ningún insumo lo dice. Dos opciones:

| Opción                | Cómo opera                                                                                                      | Coste                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · intermediario** | Los equipos hablan **sólo** con el Edge; el Edge decide siempre en local y sube a la nube                       | Cambia el camino que ya funciona en sitio (escuchas, Alarm Server, rostro, apertura, guardia, audio). La nube deja de decidir en vivo: la consola, la guardia y las alertas pasan a depender de la reconciliación. Contradice R1 del encargo (no regresión) |
| **B · contingencia**  | La nube sigue hablando con los equipos; el Edge los escucha **en paralelo** y sólo decide y acciona sin la nube | Dos clientes por equipo (dos destinos de Alarm Server en la cámara, dos suscripciones en la terminal). Riesgo en el borde: si la sonda falla con la nube viva, deciden los dos                                                                              |

## Decisión

**B.** El cliente la eligió (P-27). Concretamente:

1. **Por cada acceso, una pregunta: ¿la nube puede decidir?** Una sonda
   inmediata a `/ready` —no a `/health`: `/ready` dice si la API **puede
   decidir**, con su base— con plazo `SONDA_POR_EVENTO_MS` (1,5 s). Si el tic
   periódico ya confirmó la caída (`autonomo` y la última sonda fallida), no se
   pregunta otra vez. Si la nube contesta, el Edge **no hace nada**.
2. **Sin nube, decide con su caché** (`evaluarAcceso` de `@ncr/domain-core`, el
   mismo motor), sella la versión de reglas, marca la caché potencialmente
   obsoleta (RN-16, CA-21, KPI-31), **acciona** por `AccessPointProvider`
   —abre la barrera o contesta a la terminal— y guarda el acceso con su
   accionamiento en la bandeja, con clave de idempotencia (RN-17, CA-22).
3. **Las reglas bajan versionadas.** La API publica una versión nueva sólo
   cuando el hash del contenido cambia; el Edge pide `?desde=<su versión>`,
   verifica el hash y **sólo avanza**. Sin regla en caché, niega. «Escalar al
   portero» sin WAN también niega (P-28, PENDIENTE DE DEFINICIÓN).
4. **Identidad del Edge validada en la aplicación**: la credencial se deriva de
   una maestra (`INGESTA_FIRMA_SECRETO`) por Edge y generación; la API la
   comprueba y exige que la copropiedad pedida sea la del Edge, porque la
   identidad de servicio omite la RLS (RN-15, §2.7.6).
5. **Toda entrada local protegida**: HMAC con marca y nonce, una interfaz,
   límite de cuerpo, límite por IP. La cámara, que no sabe firmar, se acredita
   por secreto en la ruta **y** origen (C-50).
6. **Cero duplicación con la nube**: las escuchas, el receptor del Alarm Server
   y el accionamiento son los de `packages/providers`; el motor, el de
   `packages/domain-core`, sin modificar.

## Consecuencias

- **R1 se cumple por construcción**: sin Edge configurado, la API no cambia de
  comportamiento. Las regresiones de sitio siguen en verde sin tocar aserciones.
- **Riesgo del borde, declarado.** Si la nube está viva pero la sonda del Edge
  falla (enlace degradado entre el Edge y la API, no entre los equipos y la
  API), **deciden los dos**: la barrera recibe dos órdenes de apertura y la
  terminal dos veredictos. Como las dos decisiones salen del mismo motor con las
  mismas reglas (RN-16), coinciden salvo caché obsoleta. En la nube el acceso
  debería quedar una vez **por construcción**: la referencia del hecho sale de
  la misma función (`hechoDeAccesoDe`, `packages/providers`) y las dos rutas
  registran por el mismo `RegistrarAcceso`, que deriva la clave de idempotencia
  de los mismos cuatro campos. No hay prueba de extremo a extremo de la doble
  decisión (DT-15Q-03). Se mitiga con la sonda por evento y la histéresis del
  tic; se verifica en sitio (DESPLIEGUE_EDGE.md §3.1).
- **La nube en sitio con la base caída niega a la terminal.** Si la API corre en
  la red del conjunto y pierde la base, su `/ready` cae y el Edge decide; pero
  la API sigue recibiendo el evento de la terminal y le contesta «negar» por
  `FALLO_TECNICO`. Qué veredicto gana depende del orden de llegada. Registrado
  como deuda (DT-15Q-02).
- **Dependencia del equipo**: que la cámara admita dos destinos de Alarm Server
  y la terminal dos suscripciones ([SUPUESTO] S-184). Si no, el Edge no oye a
  ese equipo durante un corte.
- **Lo que el Edge no guarda sin WAN**: los eventos de equipo que no son accesos
  (puerta forzada, sabotaje) no pasan por la bandeja (DT-15Q-01).
