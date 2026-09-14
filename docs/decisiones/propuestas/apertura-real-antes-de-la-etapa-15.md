# ¿Se puede abrir y cerrar de verdad desde la consola antes de la ETAPA 15?

**Pregunta del cliente (2026-09-14).** «¿Qué hace falta para ejercer el bloqueo
y desbloqueo desde la consola, como portero y como superadministrador? ¿Basta
una implementación mínima contra un equipo, o hay que esperar a la ETAPA 15
completa?»

**Respuesta corta.** Basta una implementación mínima, y no por optimismo: es que
el camino ya está construido entero salvo el último eslabón. Lo que falta es
**un adaptador detrás de un puerto que ya existe**, no una etapa. Pero hay una
condición de entorno que decide si es posible hoy, y no es de código: **la red**.

---

## 1 · Lo que ya está hecho, comprobado en el código

La orden de abrir recorre hoy este camino completo, con pruebas:

| Tramo                            | Estado                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Consola de portería y de guardia | El botón existe en las dos, con el diálogo de motivo obligatorio                                                                   |
| API                              | `POST /copropiedades/:id/guardia/ordenes`                                                                                          |
| RBAC                             | `portero`, `operador_central`, `administrador`, `superadministrador`. **El residente nunca.** Declarado en un solo sitio           |
| Aislamiento                      | `exigirAlcance` valida la copropiedad de destino contra el alcance real; recurso ajeno → 404 (D-71)                                |
| Regla RN-08 / CA-16              | El motivo se valida **antes** de llamar al actuador: sin motivo **no se abre**, no es que se abra y se anote «sin motivo»          |
| Trazabilidad RN-02               | El rastro se escribe **antes** de tocar el relé, y hay evento tanto si abre como si niega                                          |
| Puerto                           | `AccionadorDePuerta`, con `AccionadorSimulado` detrás                                                                              |
| Registro de dispositivos         | La tabla `dispositivos` ya tiene `host`, `puerto`, `credencial_ref` —con forma `vault:…` o `env:…`—, `modelo` y `firmware` (RN-21) |

Esto **es** la prueba de OE-03 y de ADR-03: que el sistema funcione completo
contra simulación es lo que hace que el hardware sea un adaptador y no una
reescritura. Hoy, sustituir el simulado por uno real no obliga a tocar dominio,
aplicación ni interfaz. Si obligara, sería un defecto de diseño de las etapas
anteriores y habría que pararse a reportarlo.

---

## 2 · Lo que falta, pieza por pieza

| #   | Pieza                                                                                                                                                                                                                                                                                                                       | Peso        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **`AccionadorHikvision`** implementando `AccionadorDePuerta`, **dentro de `packages/providers`** —KPI-11 no admite el protocolo del fabricante en ningún otro sitio—: cliente con autenticación Digest, la orden de puerta, tiempo máximo de espera y traducción del error del fabricante a los motivos tipados del dominio | 0,5 jornada |
| 2   | **Resolución de credenciales**: `credencial_ref` → variable de entorno o bóveda. Pequeño, pero es RN-21 y §2.7.1: la credencial no puede estar en el código ni en la base en claro                                                                                                                                          | 0,3 jornada |
| 3   | **Elección del adaptador por DISPOSITIVO, no por entorno**: un equipo con `host` usa el real; el resto, el simulado. Por dispositivo y no por `NODE_ENV` — es la lección de D-67, D-68 y del arnés de pruebas: lo que se decide por modo de compilación y depende del caso concreto se rompe en el caso que nadie prueba    | 0,2 jornada |
| 4   | **Medición de latencia real** en el evento, para sostener KPI-13 y KPI-32 con datos y no con afirmaciones                                                                                                                                                                                                                   | 0,2 jornada |
| 5   | **Prueba de sustituibilidad (LSP, KPI-12)**: la misma suite pasa con el simulado y con el real sin cambiar una aserción                                                                                                                                                                                                     | 0,3 jornada |

**Total: 1,5 jornadas** para la rebanada vertical de apertura y cierre.

**Para comparar, la ETAPA 15 completa** son además el Alarm Server que traduce
el evento de placa, el alta y supresión de plantillas faciales con su ciclo
verificado, el puente de audio bidireccional, el puente de vídeo, el
descubrimiento de equipos en red, el mapa completo de errores del fabricante y
la guía de integración: del orden de **8 a 10 jornadas**. No hace falta esperar
a eso para abrir una puerta.

---

## 3 · La condición que de verdad decide: la red

El adaptador vive en la API. Para hablar con un equipo, **la API tiene que poder
alcanzarlo**, y los equipos están en la red del conjunto, con direcciones
privadas.

- Si la API corre **en la misma red** que los equipos —un portátil en sitio, o
  la API desplegada dentro del conjunto—, funciona hoy.
- Si la API corre **en la nube**, no alcanza una dirección privada. Ese caso es
  precisamente para lo que existe el **Edge Gateway** de la ETAPA 12, que sí vive
  en la red del conjunto. Montar un túnel o exponer los equipos a Internet no es
  una opción: exponer un equipo de control de acceso a Internet es el peor
  hallazgo de seguridad que este proyecto podría producir.

**Para la demostración:** levantar la API en la misma red que los equipos. Es lo
que ya se hace en el recorrido por IP del paso 12c.

---

## 4 · Lo que recomiendo, y el orden

**Sí conviene adelantarlo.** La integración con hardware pesa el 25 % de la
evaluación, tener los equipos delante es el recurso escaso, y el puerto ya está
hecho —que es justamente lo que hace que adelantarlo sea barato y no una
concesión—.

Con dos condiciones:

1. **La validación del paso 4.1 va primero.** Si la cámara resuelve la apertura
   por su cuenta, cambia qué hay que construir y en qué orden. Y si los
   endpoints de su firmware no son los que da por buenos el adaptador, el
   adaptador sale mal desde el primer día. Media jornada de validación ahorra la
   jornada y media.
2. **La rebanada se acota y se declara.** Solo `AccionadorDePuerta`. El simulado
   sigue siendo el predeterminado y la suite completa sigue corriendo sin
   hardware (KPI-12). Nada de «ir adelantando» el Alarm Server, las plantillas o
   el audio por el camino: eso es la ETAPA 15, y empezarla por partes sueltas es
   como se pierde el control de una etapa.

**Registro formal.** ADR-03 dice que el hardware va al final, y §6 condiciona la
ETAPA 15 a un prompt adicional con la documentación del modelo. Adelantar esta
rebanada es una **excepción acotada** a las dos cosas, así que —si usted la
aprueba— se registra como enmienda al ADR-03 con su frontera escrita: qué entra,
qué no, y que el simulado sigue siendo el camino por omisión.

**Lo que no le puedo prometer todavía.** Que la ruta de apertura del
videoportero sea la misma que la del terminal facial. El wiki la documenta para
la familia de control de acceso; para la de videoporteros hay que confirmarla, y
es el paso 3.2 de la validación el que lo responde. Si resultan ser dos rutas
distintas, no cambia el diseño —es un `if` dentro del adaptador, que es
exactamente el sitio donde debe vivir una diferencia de protocolo—, pero sí
cambia lo que hay que leer antes de escribirlo.
