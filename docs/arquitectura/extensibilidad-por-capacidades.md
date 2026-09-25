# Extensibilidad por capacidades · cómo se añade un fabricante sin tocar el sistema

> ETAPA 15-D (2026-09-24). Decisión en [ADR-019](../decisiones/ADR-019-el-hardware-se-elige-por-capacidades.md);
> composición en [ADR-018](../decisiones/ADR-018-punto-de-composicion-de-proveedores.md).
> Lo que aquí se describe está **PROBADO CONTRA MOCK** y contra un adaptador
> ficticio; ningún fabricante distinto del previsto se ha integrado con equipo real.

## 1 · La regla en una frase

**El sistema decide por lo que el equipo declara poder hacer, nunca por quién
lo fabrica.** La marca es un campo informativo; el modelo, un dato de
inventario. Ninguna rama del dominio, de la aplicación ni de la consola lee
ninguno de los dos para decidir.

## 2 · Las tres capas del paquete de proveedores

```
packages/providers/src
├─ nucleo/         · vocabulario NEUTRAL: capacidades (si | no | desconocida), errores tipados,
│                     el tipo ProveedorDeEquipos (los cuatro puertos del dominio + capacidadesDe)
├─ fabrica.ts      · REGISTRO de adaptadores: registrarAdaptador({ clase, produccion, crear })
├─ hikvision/      · el adaptador real; equipo/, camara/, terminal/, videoportero/ son su detalle
├─ mock/           · el adaptador simulado (ADR-003)
├─ ficticio/       · «Órbita», marca inventada con capacidades reducidas: sólo existe para la prueba
├─ contrato/       · la suite de contrato que los tres deben pasar con las mismas aserciones
├─ diagnostico/    · diagnosticarEquipo + fichaDe, polimórficos por familia (O4)
├─ index.ts        · el barril: lo ÚNICO que la aplicación importa
└─ operacion.ts    · entrada aparte para guiones de sitio (catálogo, cliente, jueces); la API no la importa
```

`nucleo/` no importa nada de `hikvision/`; `hikvision/` importa `nucleo/`.
`domain-core` no importa `@ncr/providers` jamás; `aplicacion` sólo `import type`.

## 3 · Capacidades: qué son y de dónde salen

| Capacidad                | Quién la usa                                   | Cómo se descubre en el adaptador real                                 |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| `aperturaRemota`         | `abrir()` de puerta o barrera                  | capacidades de la puerta / la ruta VERIFICADA de la barrera           |
| `verificacionRemota`     | «la terminal reporta y espera» (D2, D-130)     | configuración de control de acceso de la terminal (`[SUPUESTO]` S-35) |
| `bibliotecaDeRostros`    | `sincronizar()` y `suprimir()` de plantillas   | capacidades de la biblioteca + recuento                               |
| `gestionDePersonas`      | alta de la persona antes de la plantilla       | capacidades de control de acceso                                      |
| `audioBidireccional`     | `intercomDe()` (ADR-01), con `canal` y formato | lista de canales de audio del equipo                                  |
| `senalizacionDeLlamada`  | contestar o rechazar la llamada                | capacidades del videoportero                                          |
| `suscripcionDeEventos`   | transporte de eventos (escucha / suscripción)  | capacidades del sistema                                               |
| `reconocimientoDePlacas` | es una cámara de placa                         | capacidades del módulo de entrada                                     |
| `estadoDeBarrera`        | sondear la posición del brazo                  | capacidades de la barrera                                             |

Tres estados, y **`desconocida` nunca cuenta como `si`**. El `origen` dice si
se descubrieron, se declararon o no se consultaron.

Se descubren al sondear (alta, edición, `POST …/diagnostico`) y se **persisten**
en `dispositivos.capacidades` con su fecha; el proveedor las lee de ahí antes de
pedir nada, y sólo vuelve a preguntar si no las tiene.

## 4 · Procedimiento para añadir un fabricante

1. **Escriba el adaptador dentro de `packages/providers/src/<marca>/`** implementando
   `ProveedorDeEquipos` (los cuatro puertos del dominio más `capacidadesDe`).
   Los errores del fabricante se traducen a los de `nucleo/errores.ts`
   (`CapacidadNoSoportada`, `EquipoOcupado`, `CredencialRechazada`…): la
   aplicación no ve códigos de fabricante.
2. **Regístrelo en la fábrica**: `registrarAdaptador({ clase: '<marca>', produccion: true, crear })`.
   `PROVEEDOR_DE_EQUIPOS=<marca>` lo selecciona al arrancar (ADR-018). No toque
   `ProveedoresModule`.
3. **Páselo por la suite de contrato** añadiendo un caso en
   `contrato/contrato-de-proveedor.test.ts`: las mismas aserciones y las mismas
   adversidades que el real y el simulado. Si necesita una aserción distinta, el
   adaptador está mal, no la suite.
4. **No exporte nada suyo por el barril** salvo lo que la fábrica necesita. El
   control `frontera-extensibilidad` rompe el build si la API nombra su clase.
5. **No toque dominio, aplicación ni interfaz.** Si cree que hace falta, pare y
   repórtelo: es la regla dura de la ETAPA 15.

## 5 · La prueba de fuego, y el control que la vigila

`ficticio/` es «Órbita»: un fabricante inventado con apertura remota pero sin
biblioteca de rostros ni audio. Pasa la suite de contrato completa —incluidas
las adversidades— **sin tocar una línea de dominio**. Cada corrida del verificador
y de CI lo ejecuta; si un cambio en la API lo rompiera, el falso desacople se
vería antes de fusionar.

`scripts/lib/frontera-extensibilidad.mjs` comprueba, con prueba negativa (▸ 32):

- A · `domain-core` nunca importa `@ncr/providers`; `aplicacion` sólo en tipos;
- B · nadie fuera del paquete importa ni construye un adaptador de marca;
- C · el ficticio sólo toca `domain-core`, `nucleo` y la fábrica;
- D · el barril nunca exporta el ficticio.

## 6 · Lo que sigue sin demostrarse

Que un fabricante **real** distinto conteste como su documentación dice. Este
documento demuestra que el sistema no lo impide; no que exista. Ver
`docs/etapas/ETAPA-15-D-consolidacion.md` §11.
