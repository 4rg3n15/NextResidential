# ADR-018 · Un único punto de composición decide qué proveedor de hardware se inyecta

|                 |                                                                            |
| --------------- | -------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-C (2026-09-23)                                         |
| **Sustituye a** | Nada. **Completa ADR-003**, que prometía esto y no tenía dónde comprobarse |
| **Afecta a**    | `packages/providers`, `apps/api`, ETAPAS 05, 08, 15, 15-B, 15-C            |

---

## Contexto

ADR-003 dice que el hardware va al final y que **eso es una prueba**: si el
sistema necesita hardware para demostrarse, el desacople falló. La forma de
comprobarlo era cambiar de adaptador y ver que no había que tocar nada más.

**Hasta la 15-C eso no se podía hacer.** No existía punto de composición: el
módulo de biometría construía su proveedor de plantillas con un `new` dentro de
su propia fábrica, así que «cambiar de proveedor» significaba **editar un módulo
de la API** — exactamente lo que el ADR prohíbe, en el único sitio donde se
podía comprobar que no pasaba.

El resto de los puertos estaba peor: `AccessPointProvider`, `PlateEventSource` e
`IntercomProvider` no se resolvían de ninguna parte. El receptor del servidor de
alarma llamaba al caso de uso directamente, y el puerto de placas era un adorno
que afirmaba un desacople inexistente.

## Decisión

**Una variable de entorno validada con Zod al arranque decide qué adaptador se
compone, y un solo módulo lo hace.**

```
PROVEEDOR_DE_EQUIPOS = simulado | hikvision
```

- `crearProveedorDeEquipos` en `packages/providers/src/fabrica.ts` es el **único
  fichero del proyecto que menciona a los dos adaptadores**.
- `ProveedoresModule` en la API es el único que lo invoca, y resuelve **los
  cuatro puertos de la misma instancia**: es un equipo, y el estado que
  comparten —qué dispositivos existen, qué canal de audio está ocupado— es el
  mismo estado. Separarlo obligaría a sincronizar cuatro copias de la verdad.
- Es `@Global` a propósito. Los consumidores no se conocen entre sí —biometría
  sincroniza plantillas, guardia abre puertas, el receptor publica placas— y sin
  eso el primero que se olvidara de importarlo se construiría el suyo: dos
  conjuntos de plantillas y una supresión que no suprime la que la terminal
  tiene.

## Consecuencias

**Lo que se gana, y es el motivo entero:** cambiar esa variable **no toca una
línea de dominio, de aplicación ni de interfaz**. Esa comprobación es, en sí
misma, la prueba de OE-03. Si obligara a tocarlas, sería un defecto de diseño de
las etapas anteriores y habría que pararse y reportarlo antes de tocar nada.

**Lo que hay que aceptar:**

- El simulado es el valor por omisión **y lo seguirá siendo**. ADR-003 exige que
  todo el sistema funcione completo contra él, y un despliegue que se pusiera en
  modo hardware por descuido informaría de aperturas que nunca ocurrieron.
- **Un valor desconocido impide el arranque**, y no cae al simulado. Entre «no es
  ninguno de los dos» y «me quedo con uno», la segunda opción es cómo un sistema
  acaba en un modo que nadie eligió. La primera versión de la fábrica preguntaba
  `=== 'simulado'` y se iba al hardware en cualquier otro caso, `undefined`
  incluido; lo destapó la suite entera pidiendo hardware sin haberlo pedido.
- **Pedir el adaptador real sin registro de equipos también lanza.** Caer al
  simulado dejaría un despliegue que cree hablar con las cámaras y no habla con
  ninguna.
- El nombre del fabricante aparece **en una línea** fuera del paquete de
  proveedores: el enumerado de la configuración, eximida de KPI-11 en la propia
  línea y con motivo escrito. Es el nombre del adaptador a componer, no el
  protocolo; ningún otro fichero de la aplicación sabe qué ruta abre una barrera.

## Alternativas descartadas

**Decidirlo por `NODE_ENV`.** Es el defecto que este proyecto ya pagó tres veces
—D-67, D-68 y el arnés que apagaba la cookie segura—: algo que depende del caso
concreto decidido por modo de compilación, y roto justo en el caso que nadie
prueba. Un conjunto puede tener una barrera conectada y tres puertas que no lo
están; `NODE_ENV` no sabe nada de eso.

**Decidirlo por dispositivo, como hace el accionador de barrera.** Es lo correcto
para _accionar_ —y por eso `AccionadorSegunDispositivo` sigue existiendo— y no
para _componer_: el proveedor se construye una vez al arrancar, y elegirlo por
dispositivo obligaría a construir uno por equipo y a tener cuatro instancias de
cada puerto.

**Dejar que cada módulo construya el suyo.** Es lo que había. Produce tantas
instancias como módulos, y el defecto no se ve: cada prueba mira la suya y todas
pasan.
