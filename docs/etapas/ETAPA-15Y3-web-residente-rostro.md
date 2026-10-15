# ETAPA 15 · RONDA 15-Y3 — El rostro del residente, en la consola: «Mi rostro», la invitación y el rostro del menor

**Rama:** `etapa-15y3-web-residente-rostro` · **Base:** `etapa-15y2-web-residente-hogar` (la contiene) · **Estado:** CERRADA · 2026-10-14 · **PR:** hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de la 15-Y2 con merge commit · séptima y última de la cadena 15-S6 → 15-Y3 (encargo del 2026-10-13)

> **Lo incómodo primero.** Hasta hoy, quien sólo usa la consola —el residente
> con iPhone (P-23)— no tenía rostro: DT-15X-01 era un hueco de producto, no
> un detalle. Esta ronda lo cierra con las rutas y las palabras de la app, sin
> tocar la API ni la app. Tres verdades que no conviene tapar: (1) los umbrales
> de calidad vivían en DOS sitios (Dart y TypeScript) que coincidían por
> disciplina; ahora hay UN fichero y dos pruebas de paridad, pero **el servidor
> juzga con otros umbrales** (`UMBRALES_POR_DEFECTO` del dominio: nitidez 0,6,
> iluminación hasta 0,9, proporción hasta 0,8) y eso NO es de esta ronda ni de
> la presentación: queda registrado como **DT-15Y3-01**. (2) El detector de
> rostros no existe en todos los navegadores: sin él, quien se fotografía
> confirma el encuadre, exactamente como la app y como la consola de
> visitantes. (3) La cámara sólo se abre en un contexto seguro (HTTPS) y la
> consola la admite en una sola ruta; en `http://` local sólo queda elegir una
> foto, y el recorrido usa una cámara falsa determinista.

---

## 1 · Qué se construyó

**«Mi rostro»** (`/mi/rostro`, desde el Perfil): el estado con sus equipos y
las frases de la app («No ha registrado su rostro. Es opcional…», «Activo: el
equipo de la portería lo reconoce.», «Su rostro vence en N días…»), la
captura con la **cámara frontal** (`getUserMedia`, `facingMode: 'user'`) o
una foto del aparato, **medida en el navegador antes de que nada viaje** con
los umbrales compartidos (nitidez, iluminación, rostros, proporción) y los
consejos de la app; sin detector, la casilla «Encuadre correcto…»; la
**política** con su versión, la casilla de aceptación y, si cambió, la casilla
desmarcada y el aviso; **registrar o renovar**; **retirar** con confirmación,
en el acto y en los equipos. La imagen vive sólo en memoria: no hay
`localStorage`, `sessionStorage`, caché ni bitácora que la toque, y la captura
se descarta al registrar, al perder la conexión y al salir.

**La invitación del primer ingreso**: pasada la puerta del alta, «Entre con
su rostro» una vez, con «Registrar mi rostro» y «Ahora no» (recordado por
cuenta en ese navegador, como la app lo recuerda en el teléfono).

**El rostro de un menor del hogar** (ADR-039): en «Mi familia», de 15 a 17 el
titular ve «Registrar rostro»/«Ver su rostro» hacia `/mi/rostro?menor=…`, donde
la misma pantalla pide además las **dos declaraciones** del representante
legal; otro adulto lee «Lo registra el titular del hogar.»; a un menor de 15
no se le ofrece; a los 18 ya no es asunto del hogar.

**Los umbrales en UN solo sitio**: `packages/contracts/src/umbrales-de-calidad.json`,
leído por la consola (`UMBRALES_DE_CALIDAD` de `@ncr/contracts`) y verificado
por la app en una prueba de paridad en Dart; la consola se niega a arrancar
con un umbral que no sea un número en 0..1.

**`Permissions-Policy`**: la cámara del propio origen SÓLO en `/mi/rostro`
(§2.7.7); el micrófono cerrado; el resto del residente, como antes; con prueba
que usa el emparejador de rutas de Next. La CSP no cambia (la vista previa es
un `data:` que ya admitía `img-src`).

**El recorrido** gana el paso 9: el titular, con una cámara falsa determinista
(un `.y4m` de tablero de ajedrez que Chromium sirve como cámara), abre la
cámara, toma la foto, confirma el encuadre, acepta la política, registra,
comprueba los almacenes y retira; y tras cada alta se comprueba la invitación y
«Ahora no».

---

## 2 · Cómo se organizó y por qué

### Punto 1 · Los umbrales: un fichero, dos pruebas de paridad, y un hallazgo (DT-15Y3-01)

La consola y la app tenían cada una su copia (0,45 / 0,25–0,85 / 0,15–0,75) y
coincidían por disciplina. El encargo pedía UNA fuente: el JSON vive en
`packages/contracts/src/` porque es lo único que las dos superficies ya
comparten (el contrato), se exporta como `UMBRALES_DE_CALIDAD` —el único valor
de ejecución del paquete, y es un dato—, y la app, que no importa JSON sin
empaquetarlo como recurso, conserva sus constantes y las contrasta en
`umbrales_compartidos_test.dart`. Al hacerlo salió lo que estaba debajo: el
servidor evalúa `evaluarCaptura(medidas)` con `UMBRALES_POR_DEFECTO` del
dominio (0,6 / 0,25–0,9 / 0,15–0,8), que no son los del cliente. Una foto con
nitidez 0,5 «sirve» en la app y en la consola y el servidor la rechaza. No se
toca aquí (la ronda es de presentación): DT-15Y3-01, con la propuesta de que
el servidor lea el mismo fichero.

### Punto 2 · La captura del rostro es un componente nuevo, no una ampliación de la de visitantes

`CapturaDeFoto` (visitantes, 15-L) lee un fichero con `capture="user"`; la del
rostro necesita la cámara en vivo, el encuadre de quien se fotografía, los
consejos con las palabras de la app y descartar la imagen al salir. Ampliar
la primera habría mezclado dos pantallas con públicos distintos. Lo que las
dos comparten —reducir, medir, preparar el JPEG— sale a `lib/biometria/lectura.ts`
(`leerCaptura(fuente)`, que acepta un fichero o un `<video>`); la de
visitantes no se toca.

### Punto 3 · Una pantalla para el propio y el del menor

`PantallaDeRostro` recibe `menor: null | {residenteId, nombre}`: cambia el
título, las rutas (`…/mi/rostro` o `…/mi/menores/:id/rostro`), el cuerpo (las
dos declaraciones) y nada más. `opcionesDelRostro(copropiedadId, residenteId)`
da la misma consulta a la pantalla y a la invitación, con la misma clave. El
menor llega por `?menor=` y no por un segmento dinámico: la consola no tiene
ninguno, y así `Permissions-Policy` acota una sola ruta exacta.

### Punto 4 · La política nueva desmarca la casilla, dos veces

Como en la app: un efecto sobre la versión de la política desmarca la casilla
(y las declaraciones) cuando cambia al releer; y el 409 `POLITICA_CAMBIADA`
de la 15-Z2 la desmarca en el acto y relee. La política llega de la API con su
versión: aquí no se escribe una frase de ella (P-39 sigue provisional).

### Punto 5 · «Ahora no» se recuerda en el navegador, y es lo único que se guarda

La app guarda `ncr.rostro.ahora-no.<cuenta>` en su almacén; la consola lo
guarda en `localStorage` con la misma clave. No es un dato sensible —sólo que
se respondió—, y es una conveniencia por aparato, que es para lo que ese
almacén sirve. Todo lo demás (la imagen, las medidas, la política aceptada)
vive en la memoria de la pestaña. El recorrido comprueba que ni `data:image`
ni un JPEG en base64 quedan en los almacenes.

### Punto 6 · La cámara, sólo donde se usa

`next.config.mjs` excluye `mi/rostro` de la regla general y le da
`camera=(self), microphone=()`. La prueba de cabeceras resuelve rutas con el
emparejador de Next (no con una expresión escrita en la prueba): `/mi/rostro`
sí; `/mi`, `/mi/familia`, `/mi/rostros`, `/mi/rostro-falso`, no.

### Punto 7 · El recorrido con una cámara falsa que no depende de la suerte

Chromium sirve un `.y4m` como cámara (`--use-file-for-fake-video-capture`):
se genera en el momento un tablero de ajedrez de 4 px (nitidez que satura en
1, iluminación ~0,5). Sin detector de rostros en ese Chromium, la casilla del
encuadre aporta el rostro y la proporción; el servidor juzga las medidas
declaradas y el tipo real del JPEG. El bloque del hogar (pasos 7 y 8) sale a
`hogar.mjs` para que el guion principal siga bajo 300 líneas.

---

## 3 · Árbol de archivos

```
packages/contracts/src/umbrales-de-calidad.json             la única fuente de los umbrales
packages/contracts/src/index.ts                              `UMBRALES_DE_CALIDAD`
packages/contracts/tsconfig.json                             `resolveJsonModule`, incluye el JSON
apps/mobile/test/dominio/umbrales_compartidos_test.dart      paridad Dart ↔ JSON
apps/web/src/
├─ lib/biometria/medidas.ts                                  `UMBRALES` desde el contrato, con `umbralesDesde` que valida
├─ lib/biometria/umbrales-compartidos.test.ts                paridad TS ↔ JSON y rechazo de un umbral inválido
├─ lib/biometria/lectura.ts                           (41)  reducir, medir y preparar el JPEG, de un fichero o un `<video>`
├─ lib/rostro.ts                                     (143)  estados, textos, el menor según su edad, consejos, la clave de «Ahora no»
├─ lib/rostro.test.ts                                        cinco casos
├─ lib/api/residente.ts                                      `opcionesDelRostro`, `useRostro`, los tipos del rostro
├─ componentes/captura-de-rostro.tsx                 (240)  cámara frontal o foto, medida en el aparato, encuadre, consejos
├─ componentes/captura-de-rostro.test.tsx                    cámara negada; sin cámara
├─ app/(consola)/mi/rostro/page.tsx                          `/mi/rostro` y `?menor=`
├─ app/(consola)/mi/rostro/pantalla-de-rostro.tsx    (213)  la pantalla: estado, captura, política, registrar/renovar, retirar
├─ app/(consola)/mi/rostro/pantalla-de-rostro.test.tsx       los cinco estados; registrar; política nueva; retirar; el menor
├─ app/(consola)/mi/rostro/tarjeta-del-estado.tsx            el estado y los equipos
├─ app/(consola)/mi/rostro/politica-del-rostro.tsx           la política, la casilla y las declaraciones
├─ app/(consola)/mi/rostro/rostro-de-menor.tsx               el menor: quién, de qué edad, y la pantalla
├─ app/(consola)/mi/invitacion-del-rostro.tsx                «Entre con su rostro» / «Ahora no»
├─ app/(consola)/mi/invitacion-del-rostro.test.tsx           tres casos
├─ app/(consola)/mi/puerta-del-primer-ingreso.tsx            pasada la puerta, la invitación
├─ app/(consola)/mi/ambito.tsx · mi/page.tsx                 el usuario (`cuenta`) hasta la puerta
├─ app/(consola)/mi/hogar/fila-de-menor.tsx                  el rostro del menor en su fila
├─ app/(consola)/mi/hogar/rostro-del-menor.test.tsx          cuatro casos
├─ app/(consola)/mi/perfil/pantalla.tsx                      el atajo «Mi rostro»
├─ app/(consola)/mi/pruebas.tsx                              el rostro y el del menor
├─ app/(consola)/mi/primer-ingreso.test.tsx                  la puerta con la invitación ya respondida
├─ app/(consola)/formularios-sin-identificadores.test.tsx    la pantalla del rostro clasificada
├─ politica-de-permisos.test.ts                              la cámara sólo en «Mi rostro»
└─ next.config.mjs                                           `POLITICA_DEL_ROSTRO` y la ruta
e2e/
├─ recorrido-residente-web.mjs                               paso 9; la cámara falsa; la invitación tras cada alta
├─ residente-web/rostro.mjs                          (107)  el `.y4m`, los argumentos de Chromium, el rostro del titular
├─ residente-web/hogar.mjs                                   `pasosDelHogar` (7 y 8), antes en el guion
└─ residente-web/acciones.mjs                                `primerIngreso` responde la invitación y lo dice
scripts/verificar-etapa.sh                                   el paso 13d nombra el rostro
docs/guias/MANUAL_USUARIO.md                                 «El rostro desde la consola web (15-Y3)»
```

## 4 · Tabla SOLID

| Fichero                                              | SRP                                                    | OCP                                                     | LSP                                         | ISP                                               | DIP                                                    |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `umbrales-de-calidad.json` + índice                  | Un dato, en un sitio                                   | —                                                       | Las dos superficies lo leen igual (paridad) | —                                                 | La consola y la app dependen del contrato, no entre sí |
| `lib/biometria/lectura.ts`                           | Reducir, medir, preparar                               | Acepta cualquier `ImageBitmapSource`                    | Misma lectura que `CapturaDeFoto` hacía     | Devuelve sólo medidas, detector y base64          | Sólo DOM y las funciones puras                         |
| `lib/rostro.ts`                                      | Reglas y textos del rostro                             | Otro estado es otra rama con su frase                   | Mismas frases que Dart (pruebas espejo)     | `Pick` de lo que cada función lee                 | Sin React ni red                                       |
| `captura-de-rostro.tsx`                              | Capturar y juzgar una foto del rostro                  | Los consejos vienen de fuera (`CONSEJOS_DEL_RESIDENTE`) | —                                           | Recibe `alCambiar`, textos y `habilitada`         | `leerCaptura`, `fallosDeCalidad`                       |
| `pantalla-de-rostro.tsx`                             | Orquestar estado, captura, política y las dos acciones | El menor es un parámetro, no otra pantalla              | Con menor o sin él, la misma pantalla       | Recibe `copropiedadId` y `menor`                  | El cliente generado; las reglas de `lib/rostro`        |
| `tarjeta-del-estado.tsx` · `politica-del-rostro.tsx` | Pintar; nada de red                                    | —                                                       | —                                           | Reciben el estado o la política y callbacks       | —                                                      |
| `rostro-de-menor.tsx`                                | Decidir si este menor y quien mira pueden; delegar     | —                                                       | —                                           | —                                                 | `rostroDelMenorEnLaWeb`                                |
| `invitacion-del-rostro.tsx`                          | Ofrecer una vez y recordar «Ahora no»                  | —                                                       | Envuelve el inicio como la puerta           | Recibe `copropiedadId`, `cuenta`, hijos           | `opcionesDelRostro`, `localStorage` tras try/catch     |
| `e2e/residente-web/rostro.mjs`                       | La cámara falsa y el rostro del titular                | Otro paso del rostro es otra función                    | —                                           | Cada función recibe sólo su página y su veredicto | `entrar`                                               |

Ningún fichero nuevo pasa de 300 líneas; ningún fichero que ya pasaba crece
(`verificar-etapa.sh` cambia tres líneas de texto; `recorrido-de-consola.mjs`
y `captura-de-foto.tsx` no se tocan).

## 5 · Trazabilidad

| Elemento                         | Cómo lo cubre esta ronda                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **D-W3, D-W4, 15-X** (el rostro) | «Mi rostro» en la consola con las rutas y textos de la app                                                                              |
| **ADR-039, D3** (el menor)       | De 15 a 17, el titular, con las dos declaraciones; los demás leen por qué no                                                            |
| **Ley 1581 de 2012, P-39**       | La política vigente con su versión, aceptada expresamente; una nueva desmarca la casilla; el texto provisional                          |
| **CA-08, HU-13, KPI-16**         | La calidad se juzga en el aparato antes de enviar, con los umbrales compartidos; el servidor juzga igual (DT-15Y3-01 por la diferencia) |
| **§2.7.7**                       | La cámara sólo en `/mi/rostro`; el micrófono cerrado; CSP intacta; prueba de cabeceras                                                  |
| **P-23, DT-15W-07, DT-15X-01**   | El residente con iPhone tiene rostro desde Safari: las dos DT quedan cerradas                                                           |
| **RN-11**                        | Retirar suprime en el acto y en los equipos, por la ruta que ya lo hace                                                                 |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/web exec vitest run src/lib/rostro.test.ts
src/lib/biometria "src/app/(consola)/mi/rostro" "src/app/(consola)/mi/invitacion-del-rostro.test.tsx"
"src/app/(consola)/mi/hogar/rostro-del-menor.test.tsx" src/componentes/captura-de-rostro.test.tsx
src/politica-de-permisos.test.ts`; `cd apps/mobile && flutter test test/dominio/umbrales_compartidos_test.dart`;
el recorrido: `DATABASE_URL_PRUEBAS=… node e2e/recorrido-residente-web.mjs` (paso 13d).

**Visto fallar antes de corregir:**

- `rostro.test.ts`, `pantalla-de-rostro.test.tsx`, `invitacion-del-rostro.test.tsx`,
  `rostro-del-menor.test.tsx`, `captura-de-rostro.test.tsx` y el caso nuevo de
  `politica-de-permisos.test.ts` se escribieron ANTES del código: cayeron por
  «no se resuelve el módulo» o por la cabecera que aún no existía (5 fallos),
  y pasaron después.
- Dos de esas pruebas cayeron por culpa de la prueba, no del código, y se
  corrigió la prueba: el `fetch` sin restaurar antes del quinto estado, y un
  botón esperado de forma síncrona antes de que llegara el estado.
- La prueba de paridad en Dart y la de TS nacieron con el JSON: no se vieron
  fallar por construcción; la de TS incluye los tres rechazos de un umbral
  inválido, que sí se ejercen.
- **El verificador, en su primera corrida**, cayó en el paso 5: el barrido de
  texto visible (Bloque I) también lee los datos de prueba y la política
  provisional de los fixtures decía «(P-39)». Corregido; la suite web
  completa (914) pasa. La lección es la de la 15-Z3: ningún texto que una
  pantalla pueda enseñar lleva un código del proyecto, ni en los fixtures.
- `tsc` cayó con `exactOptionalPropertyTypes` en la descripción opcional de la
  tarjeta del estado; se corrigió sin tocar el componente de tarjeta.

**Verificador (§2.8.0), la corrida que cierra (sobre `ee496db`, 10:38 → 11:27 UTC, base del puerto 55432):** 32 de 32 pasos; 593 de 593 ficheros de prueba recogidos; 5778 pruebas por los dos caminos (turbo y vitest directo) con el mismo resultado; cobertura por capa: dominio 96,46 % de líneas (ramas 96,55 %), aplicación 97,76 % (ramas 91,69 %), global 88,51 % (ramas 87,47 %); 1 paso declarado no ejercido, preexistente y con motivo.

**Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0):**

**Las corridas, en orden:**

1. **Primera** (sobre `0addb4a`, la rama rebasada sobre el cierre de la 15-Y2 `9b74b7b`, 09:58 UTC, base del puerto 55432, sin nada más corriendo): **FALLIDA** en el paso 5 (y en cascada 6, 7 y 7b): `texto-visible.test.ts` encontró «(P-39)» en los textos de prueba de la política del rostro. Se detuvo la corrida al verlo y se corrigió en `ee496db`.
2. **Segunda, la que cierra** (sobre `ee496db`, base del puerto 55432, sin nada más corriendo):

**`VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`**

## 7 · Verificación de seguridad (§2.7)

| Medida               | Cómo queda                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Secretos             | Ninguno; la imagen vive en memoria y se descarta; ni base64 ni `data:image` en los almacenes (recorrido)                              |
| CORS, CSP            | CSP intacta: la vista previa es `data:` en `img-src`, ya admitido; el flujo de la cámara va por `srcObject`, no por una URL           |
| `Permissions-Policy` | `camera=(self)` SÓLO en `/mi/rostro`; `microphone=()` ahí y en todo el residente; prueba con el emparejador de Next                   |
| Validación           | La consola mide por cortesía con los umbrales compartidos; el servidor decide (tipo real del JPEG, medidas, política, tope diario)    |
| Rate limiting        | Sin rutas nuevas; `mi/rostro` ya tiene 10/min por identidad                                                                           |
| RLS, los dos caminos | Sin cambio en la API                                                                                                                  |
| RBAC                 | El menor sólo para el titular, de 15 a 17: la consola lo oculta y la API lo niega (403/400 con código)                                |
| Datos personales     | Política con versión y aceptación expresa; declaraciones del representante para el menor (ADR-039); «Ahora no» no es un dato personal |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **DT-15Y3-01** · el servidor juzga la calidad con `UMBRALES_POR_DEFECTO` del dominio (0,6 / 0,25–0,9 / 0,15–0,8), distintos de los del cliente (0,45 / 0,25–0,85 / 0,15–0,75) que ahora viven en el contrato: una foto que «sirve» en la app y en la consola puede rechazarla el servidor. Preexistente desde la 15-L/15-X; no se toca aquí (ronda de presentación). Propuesta: que la API lea `UMBRALES_DE_CALIDAD` del contrato.
- **S-15Y3-01** · «Ahora no» se recuerda en `localStorage` por cuenta (conveniencia por aparato, no dato sensible), como la app en su almacén.
- **S-15Y3-02** · el menor llega por `?menor=<residenteId>` y no por un segmento de ruta: la consola no tiene segmentos dinámicos y así `Permissions-Policy` acota una ruta exacta.
- **DT-15W-07 y DT-15X-01** quedan cerradas. **DT-15Y1-01** sigue (esta ronda añade un guion más a `e2e/`). **P-39** sigue abierta: el texto de la política es provisional.

## 9 · Qué debe hacer el usuario manualmente

1. Nada en Supabase: no hay migración.
2. Tras fusionar (después de la 15-Y2), desde Safari en un iPhone: entrar como
   un residente nuevo (código de plaza, «Crear cuenta», primer ingreso) y, en la
   invitación, «Registrar mi rostro»: abrir la cámara (Safari pide permiso),
   tomar la foto, confirmar el encuadre si la consola lo pide, aceptar la
   política y registrar; comprobar en la terminal facial que lo reconoce;
   «Retirar mi rostro» y comprobar que sale del equipo.
3. Decidir DT-15Y3-01 (que el servidor lea los umbrales del contrato) en la
   ronda que toque la API.

## 10 · Rama y commits

`etapa-15y3-web-residente-rostro`, desde `etapa-15y2-web-residente-hogar`
(la contiene). PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de
la 15-Y2, con merge commit. La rama se rebasó sobre el cierre de la 15-Y2
antes de su primer push (no tenía PR).

| Commit    | Qué                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `56d454a` | `feat(etapa-15y3/contratos)` — los umbrales de calidad de la captura en UN solo fichero, con paridad en TS y Dart                 |
| `b1cf52f` | `feat(etapa-15y3/web)` — «Mi rostro» en la consola: estado, política con casilla, captura medida en el aparato, renovar y retirar |
| `c5e3d13` | `feat(etapa-15y3/web)` — la invitación del rostro en el primer ingreso con «Ahora no», y el rostro del menor desde «Mi familia»   |
| `0addb4a` | `test(etapa-15y3/e2e)` — el rostro en el recorrido del residente con una cámara falsa determinista (paso 9) y el manual           |
| `ee496db` | `fix(etapa-15y3/pruebas)` — los textos de prueba de la política no llevan códigos del proyecto                                    |
| cierre    | `chore(etapa-15y3): cierre de etapa` — informe, ficha y registro                                                                  |
