# «Manzana» no sirve para todos los conjuntos: cómo modelar la agrupación

> **Propuesta escrita. No se ha construido nada.** Con una recomendación clara
> y una ventana que se cierra: ver §5.

---

## 1 · De dónde salió «Manzana», y qué dicen las fuentes

| Fuente                                                       | Qué dice                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Mockups** (`03-mockups.md` §W-03 y la ficha del residente) | «Casa 42 · **Manzana B**». Es el origen del nombre: se transcribió literal del dibujo                               |
| **Requisitos** (`.docx`)                                     | **No menciona el término.** No hay RN, HU ni CA que nombre «manzana», ni ninguna que exija una subdivisión concreta |
| **Esquema** (migración `0005`)                               | `viviendas.manzana text NULL` — texto libre, opcional                                                               |
| **Glosario** (22 términos)                                   | No lo incluye. «Vivienda» se define sin subdivisión                                                                 |

**Conclusión: el término no está fijado por ningún requisito.** Viene de un
mockup, y usted tiene razón en que no encaja: el sistema atiende villas,
parcelaciones y conjuntos de casas, y el vocabulario cambia con el tipo.

---

## 2 · Lo que de verdad varía, y lo que no

Conviene separarlos porque lleva a modelos muy distintos.

**No varía: el dato.** En todos los casos es una **cadena corta que agrupa
viviendas** — «B», «3», «Norte», «II». Misma forma, misma longitud, mismo uso:
se muestra junto al identificador y se busca por ella.

**Varía: la palabra.** Torre en edificios; bloque en conjuntos de apartamentos;
manzana en parcelaciones y loteos; etapa cuando el conjunto se construyó por
fases; sector en parcelaciones grandes.

Esa asimetría descarta la solución que parece más completa —un enumerado de
tipos de subdivisión— y apunta a otra: **un valor, y una etiqueta configurable
por copropiedad.**

---

## 3 · Las tres opciones, con lo que cuesta cada una

### Opción A · Etiqueta neutra fija: «Torre, bloque o sector»

Cambiar sólo el texto de la interfaz. Cero migración, cero contrato.

**A favor:** hoy mismo, sin riesgo.
**En contra:** una etiqueta con tres palabras separadas por comas es una etiqueta
que no dice nada en ninguno de los tres casos. En una parcelación, «Torre,
bloque o sector» es peor que «Manzana» — al menos «Manzana» era correcto una vez
de cada tres. Y el nombre del campo en el esquema y en el contrato seguiría
siendo `manzana`, así que el problema reaparece en el primer informe exportado.

### Opción B · Tipo configurable por copropiedad — **recomendada**

Dos piezas:

1. `viviendas.manzana` pasa a llamarse **`agrupacion`**: el dato es el mismo,
   el nombre deja de mentir.
2. `copropiedades` gana **`etiqueta_agrupacion`**, un texto corto que decide
   cómo se llama en **esa** copropiedad: «Torre», «Bloque», «Manzana», «Etapa»,
   «Sector» — o lo que el conjunto use de verdad.

La consola lee la etiqueta y la pinta en el formulario, en la tabla, en el
buscador y en los informes. Villas del Bosque dice «Manzana»; Torres del Parque
dice «Torre»; y ninguna de las dos ve la palabra de la otra.

**Por qué texto libre y no un enumerado.** Un enumerado cerrado obliga a
adivinar la lista completa de Colombia, y se queda corto el primer día: hay
parcelaciones que usan **manzana y lote** a la vez, y conjuntos que numeran por
**etapa y torre**. Un enumerado los forzaría a elegir mal. Con texto acotado
—de 1 a 24 caracteres, saneado como todo lo demás (§2.7.4)— el conjunto escribe
su palabra y se acabó.

**El valor por defecto es `'Torre o bloque'`**, no `'Manzana'`: es lo más común
en conjuntos urbanos, que es la mayoría, y quien no encaje lo cambia en
Configuración —que ya es editable desde el bloque 7—.

### Opción C · Jerarquía real: agrupación como entidad con padre

Modelar torres, bloques y etapas como filas con jerarquía, y colgar la vivienda
de una.

**A favor:** permite «Etapa II › Torre 4 › Apto 302» y contar por nivel.
**En contra:** es una tabla, sus RLS, su CRUD, su pantalla y su migración, para
un dato que hoy es una cadena que se muestra al lado del identificador. **Ningún
requisito lo pide** — ni RN, ni HU, ni CA, ni ninguna pantalla del mockup— y
añadiría una jerarquía que el motor de reglas no consulta.

Lo dejo nombrado porque es la salida natural si algún día se piden aforos o
informes **por torre**. No es hoy.

---

## 4 · Qué implica la opción B, sin adornos

| Pieza            | Qué cambia                                                                                                                              | Coste                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Migración `0029` | `ALTER TABLE viviendas RENAME COLUMN manzana TO agrupacion`                                                                             | **Sin transformación de datos**: un rename no toca filas |
| Migración `0029` | `ALTER TABLE copropiedades ADD COLUMN etiqueta_agrupacion text NOT NULL DEFAULT 'Torre o bloque'` con `CHECK (length BETWEEN 1 AND 24)` | Añadir columna con valor por defecto                     |
| API              | Repositorio, DTO y contrato: `manzana` → `agrupacion`. La etiqueta entra en la configuración que ya se lee                              | ~0,25 j                                                  |
| Configuración    | Un campo editable más, con la tabla de permisos que ya existe: administrador y superadministrador                                       | ~0,1 j                                                   |
| Consola          | Formulario, tabla, buscador global y ficha leen la etiqueta en vez de rotular «Manzana»                                                 | ~0,25 j                                                  |
| Seeds y pruebas  | Renombrar el campo                                                                                                                      | ~0,1 j                                                   |

**Total: unas 0,7 jornadas.**

### Sobre la migración, que es lo que preguntó

**Sí, implica migración, y es de las baratas: dos `ALTER TABLE` sin mover un
solo dato.** Un `RENAME COLUMN` en PostgreSQL es un cambio de catálogo —no
reescribe la tabla ni bloquea más que un instante— y `ADD COLUMN` con valor por
defecto tampoco reescribe desde PostgreSQL 11.

Lo que cuesta no es el SQL: es que el nombre viaja por el repositorio, el DTO,
el contrato generado, cuatro sitios de la consola y las semillas. Es trabajo
mecánico y el compilador lo guía entero, porque el cliente está generado.

---

## 5 · La ventana, y por eso lo digo ahora

**Hoy no hay ni una vivienda creada** — es precisamente el defecto que acaba de
reportar. Así que hoy el rename es un cambio de catálogo y nada más.

En cuanto empiece a dar de alta el padrón, la misma decisión pasa a exigir una
migración **con datos**: copiar valores, verificar que no se perdió ninguno,
prever la vuelta atrás. No es dramático, pero es otro trabajo y otro riesgo.

**Recomiendo la opción B, y hacerla antes de que cargue el padrón.** Si prefiere
cargar primero y decidir después, la opción A —cambiar sólo la etiqueta visible—
sirve de parche y no cierra ninguna puerta, pero deja el nombre equivocado en el
esquema y en los informes exportados.

---

## 6 · Detalle de la opción B, para aprobar o corregir

```
copropiedades.etiqueta_agrupacion   text NOT NULL DEFAULT 'Torre o bloque'
                                    CHECK (length(btrim(etiqueta_agrupacion)) BETWEEN 1 AND 24)

viviendas.agrupacion                text NULL     (antes `manzana`, mismo dato)
```

En la consola, allí donde hoy dice «Manzana»:

- Formulario de alta: la etiqueta del campo es el valor configurado.
- Tabla y buscador: la columna toma ese nombre.
- Ficha del residente: «Casa 42 · Torre B», «Casa 42 · Manzana B», según el
  conjunto.
- Configuración: un campo más, editable por administración, con el aviso de que
  cambia cómo se llama en todas las pantallas —no los datos—.

**Lo que NO haría:** ofrecer un desplegable cerrado con las cinco palabras. Es
la variante que parece más cuidada y es la que obliga a elegir mal al primer
conjunto que use dos a la vez.
