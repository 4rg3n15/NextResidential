# ADR-021 · La fotografía de identificación del visitante NO es un dato biométrico y sigue el camino de la evidencia

|                 |                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-D (2026-09-24)                                                                    |
| **Sustituye a** | Nada. Delimita frente a ADR-016 (captura biométrica) y a `docs/seguridad/ciclo-vida-biometrico.md`    |
| **Afecta a**    | `apps/api/src/autorizaciones`, `apps/web` (visitantes), migración 0034, `comun/archivos/tipo-real.ts` |

---

## Contexto

La consola necesita una fotografía del visitante junto a su autorización: el
portero la mira para confrontar con quien tiene delante. El sistema ya tiene
**dos** caminos para imágenes de personas, y no se parecen:

- **Biometría (CU-02, ADR-016):** captura con control de calidad,
  consentimiento previo, expreso e informado del **titular**, plantilla que
  viaja a la terminal, supresión programada. Ley 1581 de 2012, dato sensible.
- **Evidencia (ETAPA 06, RN-21):** objeto en bucket privado, referencia en
  `evidencias` con hash y tamaño, URL firmada de vida corta al servir.

Mezclarlos «porque los dos son fotos» habría producido lo peor de cada uno: o
una foto de identificación con consentimiento biométrico que nadie va a pedir en
una portería, o —peor— una imagen tratada como evidencia que alguien acaba
mandando a una terminal facial.

## Decisión

**La fotografía del visitante es una foto de IDENTIFICACIÓN, dato personal
ordinario con finalidad de control de acceso, y sigue el camino de la
evidencia. No es biométrica: no se genera plantilla, no viaja a ninguna
terminal, ningún algoritmo la compara.**

- Se guarda en el **bucket privado** de evidencia con clave
  `visitantes/<copropiedad>/<autorización>/<id>.<ext>`; en la base queda la fila
  de `evidencias` (tipo `foto_visitante`, hash, tamaño) y `autorizaciones`
  apunta a ella. **Nunca una URL en la base** (D-19).
- Sale **sólo** como URL firmada de 120 s (`GET …/fotografia`), y la respuesta
  lleva la URL y su vida, nada más.
- El tipo se valida por los **bytes de cabecera** (`comun/archivos/tipo-real.ts`,
  compartido con la evidencia): JPEG o PNG, y el declarado tiene que coincidir
  con el real. El tope de tamaño se aplica antes de decodificar.
- A una autorización revocada no se le adjunta nada.
- La referencia a `evidencias` desde `autorizaciones` va por **disparador**, no
  por clave ajena: `evidencias` es append-only con `UPDATE` revocado incluso al
  dueño (ADR-005) y una FK exige un bloqueo que eso impide. Es el mismo defecto
  y el mismo remedio que la migración 0021 (C-29).

## Ley 1581 de 2012, dicho con precisión

La fotografía identifica a una persona natural: es **dato personal** y se trata
bajo la finalidad declarada de control de acceso a la copropiedad, con acceso
restringido a los roles operativos y sin transferencia a terceros. **No es dato
sensible biométrico**: la ley y su reglamentación tratan como biométrico el dato
que permite la identificación **automatizada** por rasgos físicos; aquí no hay
plantilla, extracción de rasgos ni comparación por máquina. Si algún día se
quisiera reconocer al visitante por el rostro, eso es CU-02 entero —consentimiento
del titular incluido— y NO se deriva de esta fotografía.

## Alternativas consideradas

| Alternativa                                                  | Por qué no                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Reutilizar la captura biométrica de `/biometria`             | Pide consentimiento de plantilla para una foto que no genera plantilla, y sincroniza con terminal |
| Guardar la foto en `visitantes` como bytes o `data:`         | Saldría en cada listado, sin firma ni caducidad; y la fila de evidencia con hash es la traza      |
| Servir la clave del bucket y que el navegador pida el objeto | La clave se vuelve permanente en el cliente; RN-21 exige URL firmada de vida corta                |

## Consecuencias

- Dos caminos, dos módulos, dos vocabularios: `foto_visitante` en `evidencias`
  frente a `plantillas_biometricas`. Un control de código que los mezcle es un
  defecto, no una optimización.
- La consola reduce la imagen en el navegador antes de enviarla (1024 px de
  lado, JPEG): minimización, y el tipo declarado coincide con los bytes porque
  los produce el propio lienzo.

## Verificación

`apps/api/src/autorizaciones/aplicacion/fotografia-de-visitante.test.ts`,
`apps/api/test/autorizaciones-consola.e2e.test.ts` (tipo real, tope, URL
firmada, revocada) y `apps/api/test/autorizaciones-pg.test.ts` (fila de
`evidencias` y enlace por disparador).

## Contingencia

Si el cliente decide que la foto exige consentimiento expreso del visitante
(no biométrico, sino de tratamiento), se añade la constancia en el mismo caso
de uso y se bloquea la carga sin ella; el almacenamiento y la salida no cambian.
