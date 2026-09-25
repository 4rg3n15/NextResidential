# ADR-019 · El hardware se elige por CAPACIDADES declaradas o descubiertas, nunca por marca ni modelo

|                 |                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-D (2026-09-24)                                                                                |
| **Sustituye a** | Nada. **Completa ADR-003 y ADR-018**: el punto de composición elige el adaptador; esto decide qué se le pide      |
| **Afecta a**    | `packages/providers` (núcleo `nucleo/`, fábrica, adaptador ficticio, suite de contrato), `apps/api` (equipos), CI |

---

## Contexto

Hasta la 15-C el proveedor real sabía **qué familia** era cada equipo —cámara,
terminal, videoportero— y con eso decidía qué pedirle. Dos consecuencias, las
dos malas: la guardia de «el equipo no decide solo» eximía a la terminal y al
videoportero (D2 de la 15-D), y un modelo de la misma marca que no admitiera
apertura remota, o que no tuviera canal de audio, se habría descubierto **al
pedírselo en producción**, con el error del fabricante en la cara del portero.

Y había una tercera: nada impedía que un módulo de la API escribiera
`if (fabricante === 'hikvision')`. El día que lo escribiera, la ETAPA 15 —que
existe para demostrar que se puede cambiar de adaptador sin tocar nada más—
quedaría desmentida por una línea.

## Decisión

**Las decisiones se toman sobre un vocabulario NEUTRAL de capacidades, con tres
estados, y `desconocida` nunca cuenta como `si`.**

```
CapacidadesDeEquipo {
  origen: 'descubiertas' | 'declaradas' | 'sin_consultar'
  aperturaRemota · verificacionRemota · gestionDePersonas · senalizacionDeLlamada
  suscripcionDeEventos · reconocimientoDePlacas · estadoDeBarrera : 'si' | 'no' | 'desconocida'
  bibliotecaDeRostros { estado, maximo, almacenadas }
  audioBidireccional  { estado, canal, formato }
}
```

- **Se descubren** preguntando al equipo (`descubrirCapacidades`) al sondearlo, y
  se **persisten** en `dispositivos.capacidades` con su fecha. El proveedor las
  mira **antes** de pedir algo: sin `aperturaRemota = si` no se emite la orden
  de abrir, y el motivo es un error tipado (`CapacidadNoSoportada`), no el
  código del fabricante.
- **Se declaran** cuando el equipo no las contesta —una persona lo sabe— y el
  origen lo dice: `declaradas` y `descubiertas` no se confunden en pantalla.
- **La familia sólo elige qué preguntar**, nunca qué hacer. Y la marca es un
  campo INFORMATIVO (`fabricante`): se muestra y se audita; ninguna decisión lo
  lee.
- **La fábrica es un registro** (`registrarAdaptador`): los adaptadores se
  inscriben con su clase y si son de producción; nadie fuera del paquete los
  nombra.

## Alternativas consideradas

| Alternativa                                        | Por qué no                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Decidir por `modelo` con una tabla de modelos      | Cada modelo nuevo es un despliegue; y un firmware distinto del mismo modelo contesta distinto                     |
| Dos estados (`si`/`no`) y suponer `no` al no saber | «No sé» y «no» llevan a acciones distintas: uno se vuelve a preguntar, el otro se declara. Colapsarlos miente     |
| Descubrir en caliente en cada orden                | Cuatro consultas por apertura contra un equipo que ya contestó ayer; y si hoy no contesta, la orden se cae con él |

## Consecuencias

**Asumidas.**

- Existe un **adaptador ficticio de una marca inventada («Órbita»)** con
  capacidades reducidas que pasa la **misma suite de contrato** que el real y el
  simulado, sin tocar una línea de dominio. Es la prueba de fuego de este ADR y
  se ejecuta en cada corrida.
- Un control de CI (`scripts/lib/frontera-extensibilidad.mjs`) falla si el
  dominio o la aplicación importan el paquete de proveedores en valor, si alguien
  fuera del paquete nombra un adaptador de marca, si el ficticio toca algo que
  no sea el núcleo, o si el barril lo exporta. Tiene prueba negativa (▸ 32).
- La ficha de un equipo (O4) se deriva de estas capacidades: lo que la ficha
  dice y lo que el proveedor hará después salen del mismo dato.

**A asumir.**

- Una capacidad `desconocida` **bloquea** la operación que la necesita hasta que
  alguien la declare o el equipo la conteste. Es la dirección segura y produce
  fricción en el alta: la consola lo dice en la ficha, con el campo exacto.
- El vocabulario crece con cada capacidad nueva. Añadir una es añadir un campo
  con sus tres estados y su lectura en el adaptador; no es añadir un `if` por
  marca.

## Verificación

- `packages/providers/src/contrato/contrato-de-proveedor.test.ts` con tres
  proveedores y adversidades compartidas.
- `node scripts/lib/frontera-extensibilidad.mjs` en el verificador y en CI.
- `apps/api/test/equipos.e2e.test.ts` · «las capacidades DESCUBIERTAS al sondear
  se persisten y se enseñan».

## Contingencia

Si un equipo no contesta ninguna consulta de capacidades y nadie puede
declararlas, el proveedor opera como si todo fuera `desconocida`: no abre, no
sincroniza, no abre audio, y cada negativa lleva el nombre de la capacidad que
faltó. No hay modo «confiar en la marca».
