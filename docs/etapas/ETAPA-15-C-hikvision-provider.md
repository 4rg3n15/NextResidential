# ETAPA 15-C · Todo lo que la ETAPA 15 puede cerrar sin hardware

**Rama:** `etapa-15c-hikvision-provider` · **Base:** `develop` (`6a06c08`)

| Commit    | Qué trae                                                                                     |
| --------- | -------------------------------------------------------------------------------------------- |
| `ea69d9a` | `feat(etapa-15c)`: el proveedor real, la fábrica y lo que la guía integral obliga a corregir |
| `272c422` | `docs(etapa-15c)`: informe, ADR-018, contradicciones y el estado que la 15 merece            |
| `c7acab3` | `test(etapa-15c/proveedores)`: los caminos que el umbral de cobertura destapó                |

**SHA de cierre:** `c7acab3`, con los cuatro trabajos de CI en verde.

Esta ronda NO se fusiona: abre PR contra `develop` y se detiene ahí.

> **ESTA ETAPA NO CIERRA LA 15.** Su definición de terminado exige los tres
> hitos técnicos con equipo real. Lo que aquí se cierra es **la mitad que no
> necesita hardware**, y en §11 está la lista exacta de lo que sigue sin
> medirse. Ninguna cifra de latencia de este informe sale de una ejecución
> contra un aparato, porque no ha habido ninguna.

---

## 1 · Qué se construyó

La ETAPA 15 dejó escritos los adaptadores de las tres familias de equipo y el
receptor de la cámara. Lo que **no** dejó fue lo que los une: no existía
`HikvisionProvider`, no existía punto de composición, y `PlateEventSource`
—declarado en el dominio desde la ETAPA 05— no tenía una sola implementación.

Esta ronda cierra eso y, de paso, corrige cuatro cosas que la guía ISAPI
integral demuestra que estaban mal en código ya fusionado. Dos de las cuatro
fallaban **en la dirección segura**, que es la peor forma de fallar bien: una
cámara correctamente configurada se rechazaba, y el mensaje mandaba a revisar el
campo que estaba bien.

---

## 2 · Cómo se organizó y por qué

### 2.1 · Quién decide de verdad son TRES vías, no una

Hasta hoy «quién manda» era una pregunta con una respuesta: el modo de control.
La guía integral enseña que es **sólo la primera** de tres por las que ese equipo
puede abrir una barrera sin que Next Control decida nada.

| Vía | Dónde vive                         | Qué la hace peligrosa                           |
| --- | ---------------------------------- | ----------------------------------------------- |
| 1   | El modo de control                 | Con `0` o `2`, abre la cámara                   |
| 2   | Las políticas internas y los relés | **La cámara lleva su propio motor de reglas**   |
| 3   | Los disparadores vinculados        | Una acción de E/S abre el relé pase lo que pase |

La vía 2 es la que sorprende. El mismo documento de parámetros de entrada
declara, **por cada política de vehículo** —temporal, lista negra, lista
blanca—, qué debe hacer la barrera. Eso es, literalmente, el competidor directo
del motor de reglas que este proyecto dice que vive en Next Control: decide sin
vigencia, sin patrón, sin zona y sin lista negra nuestras, y lo que
registráramos después sería una segunda opinión sobre algo ya hecho.

Comprobar el modo y no mirar esa lista es **aprobar un equipo que decide por su
cuenta** en cuanto una placa esté en su lista blanca.

La vía 3 es la que ninguna comprobación anterior veía, y es la que convierte un
veredicto verde en una afirmación falsa: con el modo correcto y las políticas
correctas, un disparador con acción de E/S apuntando al relé **sube el brazo al
detectar un vehículo**, antes de que nadie nos pregunte.

**Qué bloquea y qué sólo avisa, y la distinción es deliberada.** Bloquean el
modo y una operación de apertura autónoma: las dos significan que el equipo abre
sin nosotros. Avisan `notCloseCarFollow` —no cerrar con vehículos pegados— y
`bigCarKeepOpen` —dejar el brazo arriba para vehículos grandes—: no son
decisiones de acceso, son comportamientos del brazo, pero **dejan pasar
vehículos sin evento**, así que el recuento del día se queda corto y nadie sabe
cuánto.

Y el relé: la lista dice **cuál** abre la barrera. Ese número no se adivina.
Accionar el equivocado en un equipo con varios enciende una luz mientras el brazo
sigue abajo, con el sistema informando de que abrió.

### 2.2 · El país del algoritmo, que decide si la cámara lee bien

El canal de tráfico lleva un índice que fija la **gramática de placa** del
algoritmo. Colombia es 210. Con el genérico, el equipo lee placas colombianas
con una gramática que no es la suya.

Y ahí está el problema: **no falla, acierta poco**. El síntoma en sitio no es un
error, es «la cámara lee mal» — que manda a revisar el enfoque, la luz, la altura
y el ángulo antes de que a nadie se le ocurra mirar un campo de configuración.

Tres cautelas al escribir, y las tres salen del propio documento: capacidades
primero —si el equipo no declara admitir 210, se dice y no se escribe—;
leer-modificar-escribir obligado, porque el `PUT` exige el documento básico
completo y enviar sólo el índice borraría la identificación del punto de
captura; y el índice manda sobre el país declarado, así que cuando sólo viene el
país y vale «inválido», el propio documento dice que hace falta lógica adicional
y eso **se reporta**, no se adivina.

### 2.3 · El receptor en el equipo: tres campos, tres consecuencias

**El formato.** Nuestro analizador lee XML. Con el equipo en JSON, el receptor
recibe algo que no sabe abrir y el síntoma es «sobre ilegible» en bucle: el
equipo reenvía porque nunca da la notificación por entregada, y el registro se
llena de rechazos que parecen un problema de red.

**La acreditación.** El receptor documentaba que «la cámara no firma», y eso es
cierto de una firma sobre el cuerpo. **No es cierto que llegue anónima**: el
equipo admite autenticación de tipo resumen contra nuestro extremo. Queda
declarado en `H-15-1` con lo que costaría usarla —un verificador en el receptor
y una credencial por equipo—. **El secreto de la ruta no se retira**: se
sumarían. Quitarlo a cambio de algo que todavía no está implementado dejaría el
extremo más débil que antes.

**Las imágenes.** El mismo documento trae el interruptor que decide qué envía el
equipo, y con `all` manda también los recortes de **rostro** del conductor y del
acompañante. Hoy eso se descarta al recibir, y esa alerta (`H-16-1`) **se
mantiene** como red de seguridad. Pero la Ley 1581 pide **minimización**, no
descarte posterior: el dato que no viaja no se puede filtrar, ni quedar en un
registro intermedio, ni aparecer en una captura de red. El alta propone la opción
que no envía rostros y dice en pantalla por qué.

### 2.4 · Las dos barreras hablan idiomas distintos

No son la misma orden con otra ruta: son dos vocabularios, y confundirlos produce
una petición que el equipo acepta sintácticamente y no ejecuta — el peor
desenlace, porque la consola informa de que abrió.

| Familia                       | Subir  | Bajar   | Detener | Bloquear |
| ----------------------------- | ------ | ------- | ------- | -------- |
| Aparcamiento (**VERIFICADA**) | `open` | `close` | —       | `lock`   |
| Entrada y salida (repliegue)  | `on`   | `off`   | `stop`  | `locked` |

Las erratas del fabricante —`barrietGateNum` y `barrietGateOper`, sin la «r»— se
**respetan**: corregirlas produce una petición que el aparato no entiende y un
error que no dice por qué. Queda escrito en el código para que dentro de seis
meses nadie las «arregle».

Y un hueco del vocabulario, dicho en vez de disimulado: **este vocabulario no
tiene desbloqueo**. Devolver `unlock` de la otra familia sería inventar una
operación; devolver `stop` y llamarlo desbloqueo sería peor, porque el equipo lo
aceptaría y el brazo seguiría bloqueado. Se rechaza con el motivo escrito.

### 2.5 · El puerto que estaba declarado y nadie implementaba

`PlateEventSource.suscribir` existía desde la ETAPA 05 y **no tenía una sola
implementación real**: la placa entraba por el receptor, que llamaba al caso de
uso directamente. El puerto era un adorno, y un adorno afirma un desacople que no
existe.

Ahora convergen los **dos transportes**, que no son intercambiables: el
**armado** —nosotros mantenemos el flujo abierto— y la **escucha** —el equipo
publica en nuestro receptor—. Son dos porque el propio fabricante enumera, entre
los fallos previstos, que un modelo puede no admitir la escucha; con un solo
transporte ese modelo se queda fuera y el diagnóstico es «no llegan eventos».

**Y una tensión que se reporta en vez de resolverse en silencio.**
`LecturaDePlaca` —lo que el puerto entrega— tiene cuatro campos y **no tiene
sitio para la evidencia**, que debe guardarse antes del evento porque `eventos`
es append-only. Las salidas eran tres:

1. Añadir campos a `LecturaDePlaca`. Es **cambiar el dominio** por una necesidad
   de transporte, y la regla dura de esta etapa dice que entonces hay que
   pararse y reportarlo. **Reportado queda.**
2. Dejar que el receptor siguiera llamando al caso de uso. Es lo que había.
3. Un canal **de este paquete** —no del dominio— para lo que el puerto no
   expresa, y el puerto intacto para lo que sí. Es lo que se hizo.

Hay **un solo ingestor**, y la fuente se niega al segundo: dos producirían dos
eventos por lectura en una tabla que no admite borrado, y el defecto sólo se
vería contando los accesos del día.

### 2.6 · El punto de composición, donde ADR-003 se demuestra

Hasta hoy no existía. El módulo de biometría hacía `new MockProvider` en su
fábrica, así que «cambiar de adaptador» significaba **editar un módulo de la
API**: justo lo que ADR-003 prohíbe, en el único sitio donde se podía comprobar
que no pasaba.

Ahora la decisión vive en una variable validada con Zod al arranque, un solo
fichero menciona a los dos adaptadores, y los cuatro puertos se resuelven de la
misma instancia. El detalle está en **ADR-018**.

---

## 3 · Árbol de archivos

### Nuevos

| Fichero                                                            | Para qué                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/providers/src/equipo/xml.ts`                             | Leer elementos **repetidos** y escribir conservando el documento                        |
| `packages/providers/src/equipo/tipos-de-ruta.ts`                   | Los tipos del catálogo, aparte para que dos ficheros de datos no se importen en círculo |
| `packages/providers/src/equipo/catalogo-de-la-guia.ts`             | Las 22 rutas que la guía integral añade, con su sección                                 |
| `packages/providers/src/equipo/fuente-de-placas.ts`                | El puerto de placas, con sus dos transportes y un solo ingestor                         |
| `packages/providers/src/camara/veredicto-de-control.ts`            | El veredicto completo: modo, políticas internas, relés y avisos                         |
| `packages/providers/src/camara/disparadores-vinculados.ts`         | La tercera vía por la que el equipo abre solo                                           |
| `packages/providers/src/camara/pais-del-algoritmo.ts`              | El índice de reconocimiento y su escritura segura                                       |
| `packages/providers/src/camara/receptor-en-el-equipo.ts`           | Formato, acreditación y minimización de imágenes                                        |
| `packages/providers/src/camara/capacidades-anpr.ts`                | Las cuatro consultas del §9.1.1 · basta con que se cumpla una                           |
| `packages/providers/src/barrera/barrera-de-entrada.ts`             | El segundo vocabulario de barrera y el estado del brazo                                 |
| `packages/providers/src/hikvision/registro-de-equipos.ts`          | El puerto por el que el proveedor sabe a qué dirección hablar                           |
| `packages/providers/src/hikvision/hikvision-provider.ts`           | **Una clase, los cuatro puertos**                                                       |
| `packages/providers/src/hikvision/recepcion.ts`                    | Entrada única del transporte de escucha                                                 |
| `packages/providers/src/diagnostico/diagnostico-de-equipo.ts`      | Todo lo que hay que saber de un equipo, preguntado una vez                              |
| `packages/providers/src/diagnostico/ficha.ts`                      | El diagnóstico en la forma que una pantalla puede pintar                                |
| `packages/providers/src/diagnostico/correcciones.ts`               | Leer-modificar-escribir con confirmación de una persona                                 |
| `packages/providers/src/fabrica.ts`                                | El punto de composición (ADR-018)                                                       |
| `packages/providers/src/contrato/contrato-de-proveedor.test.ts`    | **La prueba de LSP**: las mismas aserciones contra los dos                              |
| `packages/providers/src/contrato/desenlaces-de-error.test.ts`      | Los «no» del equipo, cada uno con su reacción                                           |
| `apps/api/src/proveedores/proveedores.module.ts`                   | El único módulo que compone proveedores                                                 |
| `apps/api/src/alarmserver/aplicacion/ingestor-de-publicaciones.ts` | El único camino de una lectura a un hecho registrado                                    |
| `apps/api/src/equipos/infraestructura/corrector-por-proveedor.ts`  | Aplicar una corrección desde el servidor, con firma                                     |
| `apps/web/src/app/(consola)/dispositivos/ficha-del-equipo.tsx`     | Qué hay que cambiar, campo por campo, con su botón                                      |
| `apps/web/src/lib/equipos/caracteres-admitidos.ts`                 | Rechazar en el formulario lo que el equipo va a rechazar                                |
| `docs/decisiones/ADR-018-punto-de-composicion-de-proveedores.md`   | La decisión de §2.6                                                                     |

### Modificados (selección)

| Fichero                                               | Qué cambia                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `camara/modo-de-control.ts`                           | **[CORREGIR]** las dos grafías del modo; el error lleva todos los motivos |
| `hikvision/contratos-de-evento.ts`                    | **[CORREGIR]** la confianza y la hora sin desplazamiento                  |
| `equipo/errores-del-fabricante.ts`                    | Los ocho códigos de estado con cinco reacciones, y los códigos por módulo |
| `terminal/terminal-facial.ts`                         | Rechaza una plantilla vacía · **lo encontró la suite de contrato**        |
| `simulacion/equipo-simulado.ts`                       | Responde los documentos literales de la guía y admite varios equipos      |
| `providers/src/index.ts`                              | **El barril se encogió**: fuera las piezas de cada familia                |
| `alarmserver/presentacion/alarm-server.controller.ts` | Acredita, abre y publica. Nada más                                        |
| `biometria/biometria.module.ts`                       | Se le quita el `new MockProvider`                                         |
| `equipos/infraestructura/sonda-por-proveedor.ts`      | Delega en el diagnóstico; ya no conoce el protocolo ni por tipo           |

---

## 4 · Tabla SOLID

| Principio | Cómo se materializa aquí                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | `veredicto-de-control` juzga, `disparadores-vinculados` juzga otra cosa, `diagnostico` pregunta y `ficha` aplana para pintar. El controlador del receptor pasó de orquestar cuatro pasos a hacer uno |
| **OCP**   | Una vía nueva por la que un equipo pudiera abrir solo se añade como un juez más y se suma al veredicto; `HikvisionProvider` no cambia                                                                |
| **LSP**   | **La suite de contrato es este principio hecho prueba**: las mismas aserciones contra los dos proveedores, sin una rama. Encontró una divergencia real y se arregló en el adaptador                  |
| **ISP**   | `RegistroDeEquipos` tiene **un** método. `IngestorDePublicaciones`, uno. Un `HardwareService` con quince habría obligado a cada doble a implementar catorce que no usa                               |
| **DIP**   | El proveedor depende de `RegistroDeEquipos`, que la API implementa con su base. El paquete de adaptadores no sabe qué es PostgreSQL                                                                  |

---

## 5 · Trazabilidad

| Elemento                   | Cómo queda                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OE-03**                  | **Demostrado en lo que se puede demostrar sin hardware**: cambiar el proveedor no toca dominio, aplicación ni interfaz, y la suite de contrato pasa con los dos. Lo que NO demuestra: que el equipo responda como la guía dice |
| **RN-02**                  | El ingestor es el único camino a `RegistrarAcceso`; no hay rama que abra sin dejar evento                                                                                                                                      |
| **RN-09, RN-10**           | Minimización de rostros **en el origen**, y la alerta `H-16-1` se mantiene como red                                                                                                                                            |
| **RN-17, CA-22**           | El reabastecimiento del equipo obliga a que la clave de idempotencia cubra también la ventana larga tras un corte de red                                                                                                       |
| **RN-21**                  | La credencial se descifra en **un solo método**, no sale por ninguna ruta, no se registra                                                                                                                                      |
| **KPI-11**                 | Sin fugas. Una línea eximida, en la propia línea y con motivo: el nombre del adaptador a componer, que no es protocolo                                                                                                         |
| **KPI-12**                 | La suite completa corre sin hardware, y ahora también **contra el adaptador real** apuntando al equipo simulado                                                                                                                |
| **KPI-13, KPI-32, KPI-33** | **Sin medir.** Exigen el aparato                                                                                                                                                                                               |

---

## 6 · Pruebas

| Suite              | Resultado              |
| ------------------ | ---------------------- |
| `@ncr/providers`   | 431 pasan (era 193)    |
| `@ncr/api`         | 911 pasan · 5 omitidas |
| `@ncr/web`         | 408 pasan (era 385)    |
| `@ncr/domain-core` | 400 pasan              |
| `@ncr/edge`        | 101 pasan              |
| `@ncr/config`      | 144 pasan              |

### Lo que la suite de contrato destapó

**`TerminalFacial` aceptaba una plantilla vacía y `MockProvider` la rechazaba
desde la ETAPA 05.** No eran intercambiables, y la diferencia caía del lado peor:
contra el equipo real, una captura fallida que nadie comprobó se subía igual y
dejaba en la terminal **una plantilla que no reconoce a nadie, nunca**. El
síntoma en sitio es un residente al que la puerta no le abre, con todo el sistema
diciendo que su rostro está sincronizado.

Es exactamente para lo que la prueba de LSP existe, y el arreglo fue en el
adaptador, no en la aserción.

### Y lo que destaparon los controles al cerrar

| Hallazgo                                                                                                                                                                              | Corregido                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **KPI-11 marcó el XML del fabricante escrito en una prueba de la API.** Tenía razón: el nombre de un elemento es vocabulario del fabricante aunque esté en un banco de pruebas        | Los documentos los sirve ahora el equipo simulado del paquete de proveedores                        |
| **La fábrica se iba al hardware con `undefined`.** Preguntaba `=== 'simulado'` y cualquier otra cosa era hardware. Lo destapó la suite entera pidiendo equipos que nadie había pedido | Se comprueba contra la lista, y lo desconocido rompe                                                |
| **El barrido genérico de formularios tecleaba un valor con espacios en el campo de usuario**, que el equipo no admite                                                                 | El valor pasó a ser válido en todos los campos; el barrido sigue sin saber nada de ninguna pantalla |

### El umbral de cobertura del paquete, que no era una formalidad

El paquete de proveedores lleva su propio umbral del 90 %, y el código nuevo lo
bajó al **88,81 % de ramas**. Subirlo obligó a escribir las pruebas de los
caminos que nadie había recorrido, y tres de ellos eran defectos de verdad,
no huecos decorativos:

| Camino sin recorrer                                                                                                                                                        | Por qué importaba                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Diagnosticar un equipo que NO es una cámara.** Las seis preguntas de «quién decide» sólo existen en la cámara y nadie había probado que no se le hicieran a una terminal | Preguntárselas a una terminal facial llenaría su ficha de consultas sin respuesta que no son un defecto del aparato, sino una pregunta mal hecha                        |
| **Un sobre cuyas partes no declaran `Content-Type`.** Toda la suite las traía declaradas                                                                                   | Ese firmware existe: clasificar sólo por el tipo declarado dejaría el evento entero como ilegible —placa incluida— por una cabecera que el protocolo no obliga a enviar |
| **Una política interna sin número y con una operación fuera del catálogo**                                                                                                 | Es justo el caso que el veredicto tiene que bloquear, y era el único de los tres que ninguna prueba ejercitaba                                                          |

El umbral no encontró los defectos: encontró **dónde no habíamos mirado**, que
es para lo que está. La cobertura de ramas del paquete quedó en **91,05 %**.

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

```
▸ 5 · suite completa
   @ncr/api:test: Tests 916 passed (916) · @ncr/config:test: Tests 144 passed (144)
   @ncr/domain-core:test: Tests 400 passed (400) · @ncr/edge:test: Tests 101 passed (101)
   @ncr/providers:test: Tests 431 passed (431) · @ncr/web:test: Tests 408 passed (408)

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 181 de 181 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 97.68 % · ramas 96.92 % · funciones 97.38 % (umbral 90 %, 34 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 96.58 % · ramas 91.22 % · funciones 98.39 % (umbral 90 %, 46 archivos)
     OK   global: lineas 78.03 % · ramas 86.30 % · funciones 81.12 % (umbral 70 %, 386 archivos)
   ✓ las tres capas cumplen su umbral

▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 2400 pruebas

▸ 9 · pruebas negativas de los propios controles
   ✓ controles: 34 de 36 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 27 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 35 controles medidos · 231 bloques sin ejercer (no puede subir)

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ frontera-modulos: 13 módulos, ninguna importación entra por dentro y un solo Pool de PostgreSQL (D-66)
   ✓ escaneo de secretos: limpio
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/ (los rangos de
     documentación de RFC 5737 no cuentan: no son de nadie)

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico
     y ningún error sin manejar

▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 26 de 26 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado y no ejercido es el de siempre y **no corre en Linux**: lleva
su motivo escrito y su etapa de revisión vigente, que es la condición con la que
el propio verificador lo admite.

### Dos corridas que NO valen, y por qué se dicen

La primera corrida de cierre salió **FALLIDA** y la segunda también. Ninguna de
las dos fue un defecto del código, y las dos se dejan escritas porque un informe
que sólo enseña la corrida que salió bien es la clase de documento que este
proyecto no admite:

| Corrida | Veredicto | Causa real                                                                                                                                                                                                    |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.ª     | FALLIDA   | La base efímera no estaba levantada y el SDK de Flutter no estaba en el `PATH`. Los siete `✗` eran el mismo hecho contado varias veces: sin informe de `@ncr/api`, sus 78 ficheros figuran como no ejecutados |
| 2.ª     | FALLIDA   | **D-112** · se lanzaron dos verificadores a la vez y el primero escribió `.arranque-en-frio.json` entre el paso 5 y el paso 7 del segundo, así que el paso 5 omitió cinco pruebas que el paso 7 ejecutó       |

El segundo caso es el control haciendo exactamente su trabajo: dos recuentos
distintos de la misma suite significan que uno de los dos no está ejecutando lo
que cree, y eso no se ignora aunque la causa resulte ser del operador. La tercera
corrida se hizo **en solitario y desde el mismo estado del que parte CI**.

### CI sobre la SHA final

Los cuatro trabajos en verde sobre **`c7acab3`**:

| Trabajo                                 | Resultado |
| --------------------------------------- | --------- |
| `controles (ubuntu-latest)`             | success   |
| `controles (macos-latest)`              | success   |
| `los seis entregables (ubuntu)`         | success   |
| `verificar-etapa.sh --con-base (macos)` | success   |

---

## 7 · Verificación de seguridad (§2.7)

| Medida                        | Cómo queda                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Secretos en entorno**       | Las dos variables nuevas están en `.env.example` sin valor; el control lo comprueba                                 |
| **Validación en el servidor** | La corrección exige confirmación **y sin ella no emite la petición**; la del formulario se suma, no sustituye       |
| **Anti inyección**            | Nada de lo nuevo construye SQL. Lo que se escribe al equipo se escapa                                               |
| **RLS**                       | La lectura de la credencial pasa por el mismo cliente con claims que el resto del repositorio                       |
| **RN-21**                     | La credencial se descifra en un método, se usa y no sale. El DTO de lectura no declara el campo                     |
| **Auditoría**                 | Toda corrección deja constancia con **valor anterior y nuevo**: «alguien corrigió algo» no permite reconstruir nada |

---

## 8 · Deuda técnica, supuestos y pendientes

- **`[SUPUESTO]` S-32** · el juego exacto de caracteres especiales que el equipo
  admite en usuario y contraseña **no se transcribió**: la guía lo enumera en una
  tabla que no llegó a este árbol. Lo implementado es deliberadamente **más
  permisivo** en los especiales y **igual de estricto** en lo que puede hacer
  daño (controles y byte nulo). Un validador más estricto que el aparato
  rechazaría credenciales legítimas, que es peor.
- **`LecturaDePlaca` no tiene sitio para la evidencia.** Reportado en §2.5 en vez
  de cambiar el dominio por una necesidad de transporte.
- **El audio del videoportero sigue sin implementarse**, y sigue diciéndolo: falta
  medir códec, cadencia y duplex contra el aparato.
- **Nada de esto se ejecutó contra hardware.** Ver §11.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Dejar `PROVEEDOR_DE_EQUIPOS=simulado`** hasta tener los equipos dados de
   alta y verificados. Ponerlo en el otro valor sin registro **impide el
   arranque**, a propósito.
2. **Crear en cada aparato un usuario de servicio con perfil de OPERADOR**, no
   administrador, y comprobar con el diagnóstico que ese perfil alcanza lo que la
   integración necesita.
3. **Revisar la ficha de cada cámara** y corregir lo que salga en rojo. Las tres
   vías por las que un equipo abre solo salen enumeradas con su valor correcto.
4. **Comprobar el índice de país.** Si no es 210, la cámara lee mal sin dar
   error.
5. **Bajar el envío de imágenes** a la opción que no manda rostros, desde el
   propio botón de la ficha.

---

## 10 · Rama y commits

**Rama:** `etapa-15c-hikvision-provider` · **Base:** `develop` (`6a06c08`)

---

## 11 · LO QUE SIGUE SIN DEMOSTRARSE, DICHO SIN SUAVIZAR

**Nada de esta etapa se ejecutó contra hardware.** El entorno donde se construyó
deniega por diseño todo destino de rango privado, de modo que la red donde viven
los aparatos es inalcanzable desde aquí, hoy y siempre.

**Que la suite de contrato pase con los dos proveedores demuestra que son
intercambiables. No demuestra que el equipo responda como la guía dice.** Son dos
afirmaciones distintas y sólo una está probada: el simulado contesta lo que el
documento del fabricante describe, y que el aparato haga lo mismo es
precisamente lo que falta por comprobar.

### Los tres hitos técnicos del reto · SIN EJECUTAR

| Hito                                                                                | Estado           |
| ----------------------------------------------------------------------------------- | ---------------- |
| Prototipo funcional con equipo real                                                 | **Sin ejecutar** |
| Prueba LPR real (app → detectar → validar → abrir talanquera → evento)              | **Sin ejecutar** |
| Prueba facial real (foto → sincronizar → reconocer → validar zona → abrir → evento) | **Sin ejecutar** |

### Los KPI que siguen sin medir

| KPI                                 | Qué mide                                          | Por qué no se ha medido                                                                         |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **KPI-13**                          | Apertura de barrera < 3 s                         | Exige accionar un relé de verdad                                                                |
| **KPI-32**                          | Apertura remota < 3 s                             | Ídem                                                                                            |
| **KPI-33**                          | Audio y video < 2 s extremo a extremo             | El canal de audio del equipo está deshabilitado de fábrica y el transporte no está implementado |
| **KPI-16 a KPI-18, KPI-20, KPI-21** | Calidad, sincronización y supresión de plantillas | Exigen la terminal facial                                                                       |
| **KPI-26**                          | Reporte de sabotaje y estado de puerta            | Exige el controlador de E/S                                                                     |

### Las rutas que siguen sin verificar

De las **34 rutas** del catálogo, **una** está VERIFICADA —la de la barrera,
capturada del aparato el 15/09/2026—. Las demás están respaldadas por la guía
oficial, con su sección citada, y **eso no es lo mismo**: el fabricante lo
documenta, pero que ESTE firmware lo implemente sólo lo dice el aparato. El
propio documento enumera, entre sus fallos previstos, que un modelo puede no
admitir la escucha de eventos.

### Qué haría falta para cerrar la ETAPA 15

El equipo delante, con su documentación ISAPI del modelo concreto, IPs y
credenciales, y el guion de puesta en marcha ejecutado ruta por ruta. Hasta
entonces, **la ETAPA 15 sigue ABIERTA** y este informe cierra la 15-C.
