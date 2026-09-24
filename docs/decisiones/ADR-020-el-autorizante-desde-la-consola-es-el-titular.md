# ADR-020 · Una autorización creada desde la consola se registra a nombre del residente titular de la vivienda

|                 |                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-D (2026-09-24) · `[SUPUESTO]` S-38, **pendiente de ratificación del cliente** |
| **Sustituye a** | Nada. Precisa RN-05 para el caso que el documento no contempla                                    |
| **Afecta a**    | `apps/api/src/autorizaciones` (adaptador PostgreSQL y caso de uso), migración 0013                |

---

## Contexto

RN-05 dice que un residente sólo autoriza hacia su propia vivienda y que debe
ser titular, y la base lo impone con el disparador `tg_autorizacion_coherente`:
`autorizaciones.autorizado_por` **tiene que ser un residente titular activo** de
la vivienda destino.

La consola de administración y la de portería crean autorizaciones (HU-07,
HU-16), y quien pulsa es un **usuario** —administrador o portero—, no un
residente. Desde la ETAPA 09-B el adaptador escribía el identificador de ese
usuario en `autorizado_por`; el disparador lo rechazaba, y **ninguna
autorización creada desde la consola llegaba a existir contra una base real**
(D-131). Las pruebas con dobles no lo veían porque el disparador no está en el
doble; se vio al escribir la primera prueba contra base de la 15-D.

## Decisión

**Cuando quien crea no es residente, `autorizado_por` es el residente TITULAR
activo de la vivienda destino, y `creado_por` conserva al actor real.**

- El adaptador lo resuelve (`autorizanteDe`): si la autorización ya existe,
  conserva su autorizante —editar no reescribe la historia—; si es nueva, busca
  el titular activo de la vivienda.
- Sin titular activo no hay a nombre de quién autorizar: el adaptador lanza
  `ViviendaSinTitular`, la aplicación la traduce a `INVARIANTE_VIOLADA` con
  RN-05 y la consola lo dice con esas palabras. **No se inventa un residente ni
  se relaja el disparador.**
- La traza completa queda: `autorizado_por` (a nombre de quién), `creado_por`
  (quién lo hizo), `actualizado_por` (quién lo cambió).

## Alternativas consideradas

| Alternativa                                               | Por qué no                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Relajar el disparador para admitir usuarios de consola    | RN-05 dejaría de ser verificable en la base; y la app del residente, que sí cumple, perdería la garantía         |
| Exigir que la consola elija el residente en el formulario | Es pedir un dato que el administrador no tiene a mano (D-72) y que la base ya sabe: la vivienda tiene un titular |
| Una columna nueva `autorizado_por_usuario`                | Duplica lo que `creado_por` ya dice y obliga a tocar el esquema por un caso que se resuelve leyendo              |

## Consecuencias

- Una vivienda **sin titular activo** no puede recibir autorizaciones desde la
  consola. Es coherente con RN-05 y RN-13, y la consola lo explica.
- Es un `[SUPUESTO]` (S-38): el documento no dice quién figura como autorizante
  cuando autoriza la administración. La alternativa conservadora —negar— está
  implementada para el caso sin titular; la decisión de «a nombre del titular»
  necesita la ratificación del cliente.

## Verificación

`apps/api/test/autorizaciones-pg.test.ts`: crea desde la consola contra base
real, comprueba que `autorizado_por` es titular y `creado_por` el actor, y que
una vivienda sin titular devuelve el error tipado.

## Contingencia

Si el cliente decide otra cosa —por ejemplo, que la consola registre un
«autorizante administrativo»—, cambia el adaptador y una columna; el caso de
uso, el dominio y la consola no se tocan.
