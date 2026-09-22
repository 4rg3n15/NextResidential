# ETAPA 15 — Integración con hardware Hikvision

**Rama:** `etapa-15-integracion-hikvision` · **Base:** `develop` (`b9d2a60`)
**Fecha:** 2026-09-22

---

> ## Lo primero, y no se entierra en un apartado
>
> **Nada de esta etapa se ejecutó contra un equipo real.** El entorno de
> desarrollo deniega por diseño todo destino de rango privado —`x-deny-reason:
private_dest_ip`—, así que la LAN donde viven los tres aparatos es
> inalcanzable, hoy y siempre, desde donde se escribió este código.
>
> El reparto que eso impone: **el código, las pruebas y el procedimiento están
> escritos; el accionamiento y la configuración de los equipos los hace el
> usuario.** Ninguna afirmación de este informe dice que un relé se movió.
>
> Lo que sí se puede afirmar, y se afirma: el sistema recorre los tres caminos
> completos contra equipos simulados, en la suite y en CI, sin un solo aparato.
> Eso es ADR-03, y es la prueba de OE-03 que esta etapa venía a dar.

---

## 1 · Qué se construyó

La pieza que de verdad faltaba era **el receptor del «servidor de alarma»**: el
extremo que la cámara publica. `POST /ingesta/eventos` exige firma HMAC
(RNF-03.11) y la cámara no firma —publica `multipart/form-data` sin prueba de
autoría y ningún ajuste del equipo lo cambia—, así que había un camino que
simplemente no existía. Ahora existe, y **no decide nada**: traduce el sobre del
fabricante a un hecho del dominio y se lo entrega al mismo `RegistrarAcceso` que
ya usan la ingesta firmada y el Edge. Sólo si aquel dijo permitido, acciona el
relé.

Alrededor: un **catálogo de rutas con su procedencia al lado**, un transporte
compartido por los tres aparatos, los adaptadores de la terminal facial y del
videoportero, **un equipo simulado que habla como los de verdad**, la superficie
de captura de rostro en la consola, el resultado de la última sincronización en
el panel de equipos, y un guion de puesta en marcha que confirma o desmiente
cada ruta delante del hardware.

**La regla dura se cumplió: no hubo que tocar dominio ni aplicación.** Lo que se
escribió son adaptadores de puertos que ya existían —`FaceTemplateProvider`,
`AccessPointProvider`, `IntercomProvider`, `ControlDeBarrera`— y una capa de
presentación nueva. Esa verificación es, en sí misma, la prueba de OE-03.

> **Dos excepciones, las dos en PRESENTACIÓN y ninguna en dominio ni
> aplicación**, declaradas aquí para que se puedan discutir: se añadió
> `superadministrador` a los roles de dos rutas de biometría, y subió el techo
> de tamaño del dato biométrico. El detalle, en §8.3.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · Un catálogo de rutas, con su procedencia, y ninguna sin etiqueta

Este repositorio prohíbe **deducir una ruta por analogía**. No es una regla de
estilo: suponer que la barrera vivía en `Traffic` o en `System/IO` porque así es
en otra familia costó dos intentos fallidos contra el equipo real, y el aparato
contestó `notSupport` a los dos.

Hoy sólo hay **una ruta VERIFICADA** —la de la barrera, capturada del JavaScript
de la interfaz del propio equipo el 15/09/2026— y **doce DOCUMENTADAS, NO
VERIFICADAS**, de la guía ISAPI del fabricante. Están todas en un solo fichero,
cada una con su fuente literal y con **qué comprobar en sitio para ascenderla**:
una etiqueta «pendiente de verificar» que no dice qué verificar es media
etiqueta, y delante del equipo no sirve de nada.

Que una falle con `notSupport` o `404` **está previsto**. La salida es capturar
la buena y cambiarla ahí, nunca probar otra por parecido.

### 2.2 · El receptor no decide, y ése es el punto

El orden del receptor es deliberado y cada paso tiene su coste escrito:

1. abrir el sobre y normalizar — en memoria, sin red;
2. **guardar la evidencia, acotada por tiempo**;
3. decidir y registrar el evento inmutable;
4. accionar, sólo si quedó permitido y no era un duplicado.

El paso 2 va **antes** del 3 porque `eventos` es append-only (ADR-05): un evento
escrito sin su evidencia no se corrige después. Y va **acotado** porque está
dentro del tramo que mide KPI-13: si el almacén tarda, se sigue sin evidencia y
se registra que se siguió. Perder la foto es malo; dejar la talanquera cerrada
porque el almacén de objetos va lento, peor.

### 2.3 · El analizador del sobre es binario-seguro, y no por elegancia

Recorre `Buffer`, nunca cadenas. Pasar un JPEG por `toString('utf8')` lo
corrompe, y el defecto **no aparece hasta que alguien abre la evidencia meses
después**, cuando ya no se puede reconstruir. Tiene prueba propia con bytes que
no sobreviven a esa conversión.

Las partes se clasifican **por tipo de contenido y no por nombre**: los nombres
del fabricante están documentados y no verificados. Con dos imágenes, el recorte
es el menor de los dos —eso sigue siendo cierto aunque los nombres cambien—.

### 2.4 · La terminal facial soporta los dos modos, y el modo se DECLARA

Hoy la terminal **abre por su cuenta**, lo que contradice el principio rector.
Si eso se puede cambiar depende de que el firmware permita separar reconocer de
accionar, y **eso se comprueba delante del equipo**.

| Modo               | Quién decide  | Qué gobernamos                     |
| ------------------ | ------------- | ---------------------------------- |
| `reporta_y_espera` | Nuestro motor | Todo. Es el principio rector       |
| `decide_el_equipo` | La terminal   | Sólo QUÉ plantillas están cargadas |

En `decide_el_equipo` la revocación se ejerce **retirando la plantilla**, y hay
que decirlo así: entre que la vigencia vence y que la supresión llega, el equipo
abre. **El modo no se deduce de una respuesta del equipo**: deducirlo
escondería la decisión arquitectónica más importante de la etapa dentro de una
rama de código.

### 2.5 · El flujo de eventos: un solo detalle, y es el diseño entero

El equipo **vuelca todo el historial al conectar**, con `currentEvent: false`.
Sin filtrarlo, cada timbrazo de las últimas semanas entra como «está llamando
ahora»: alertas al operador, residentes avisados de visitas de hace quince días,
y eventos falsos en una tabla append-only que **no se puede limpiar**. No es un
caso raro: pasa en cada reconexión.

Lo histórico no se descarta en silencio, **se cuenta**. Ese número en el registro
del arranque es lo único que distingue «el equipo está mudo» de «volcó 412 viejos
y los tiramos todos».

El reensamblado de bloques cuenta llaves **fuera de cadena y con su escape**,
porque el flujo llega en trozos que no respetan los límites de los objetos y uno
con una llave dentro de un texto se partiría por la mitad.

### 2.6 · El canal de audio está escrito y apagado, las dos cosas a la vez

Está deshabilitado **en el aparato** —medido el 18/09/2026, junto con que lo
soporta con G.711 µ-law— y activarlo es un ajuste del equipo que hace el usuario.
Deshabilitado, el adaptador **no emite ni una petición**: uno que encendiera por
su cuenta una vía de audio hacia la calle sería una decisión de seguridad tomada
por el código.

El transporte del audio **lanza en vez de devolver silencio**. Qué códec negocia
este firmware, si es semiduplex y con qué tamaño de paquete son medidas que no
existen; simular que funciona haría que la consola diera por bueno un canal que
nunca se ha abierto.

### 2.7 · El simulador: la otra mitad de ADR-03

Sin un equipo que conteste, los adaptadores sólo se podrían probar con dobles
escritos a la medida de cada prueba, **y un doble a medida confirma lo que el
autor ya creía**. El simulado responde Digest de dos viajes —como el aparato—,
puede declarar qué rutas no soporta, y vuelca historial antes de lo vivo.

Y como la cámara es el único de los tres que **empuja**, hay una cámara simulada
que construye el multipart y lo publica contra el receptor real. La prueba de
extremo a extremo usa **ese** sobre y no uno escrito a su medida.

---

## 3 · Árbol de archivos

| Fichero                                                        | Para qué                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/providers/src/equipo/catalogo-de-rutas.ts`           | Las 13 rutas con su procedencia, cuerpo y banderas           |
| `packages/providers/src/equipo/cliente.ts`                     | Transporte: Digest, tiempos límite, flujo sostenido          |
| `packages/providers/src/equipo/escucha-alertstream.ts`         | Escucha con filtrado del volcado histórico y reconexión      |
| `packages/providers/src/terminal/terminal-facial.ts`           | `FaceTemplateProvider` + `AccessPointProvider`, dos modos    |
| `packages/providers/src/videoportero/videoportero.ts`          | Apertura remota atribuida al operador                        |
| `packages/providers/src/videoportero/intercom-equipo.ts`       | `IntercomProvider` sobre el canal del equipo, apagado        |
| `packages/providers/src/hikvision/publicacion-alarm-server.ts` | El sobre que publica la cámara, binario-seguro               |
| `packages/providers/src/simulacion/equipo-simulado.ts`         | Un `fetch` que se comporta como el equipo descrito           |
| `packages/providers/src/simulacion/camara-que-publica.ts`      | La cámara que empuja, para probar el receptor                |
| `apps/api/src/alarmserver/**`                                  | El receptor: controlador, guard y módulo                     |
| `apps/api/src/comun/equipos-de-alarm-server.ts`                | Registro de equipos acreditados (H-15-1)                     |
| `apps/api/src/comun/sobre-de-equipo.ts`                        | Acumulador del cuerpo crudo, acotado en tres dimensiones     |
| `apps/api/src/comun/actores-de-servicio.ts`                    | La identidad con la que se atribuyen los eventos de hardware |
| `apps/web/src/lib/biometria/**`                                | Medidas de calidad puras, detección y preparación de imagen  |
| `apps/web/src/app/(consola)/biometria/**`                      | La pantalla de captura del superadministrador                |
| `scripts/probar-barrera.mjs`                                   | Punto de control 1: que el relé responda                     |
| `scripts/puesta-en-marcha-equipos.mjs`                         | El comando de puesta en marcha en sitio                      |
| `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md` §8               | Lo que le toca al usuario, con estado previo para revertir   |

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa                                                                      | Verificación                                        |
| --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **SRP**   | Transporte, catálogo y adaptador son tres ficheros. Ninguno supera 300 líneas            | El mayor es el catálogo, 246                        |
| **OCP**   | Un equipo nuevo es un adaptador nuevo y entradas de catálogo: cero diff en el transporte | La terminal y el videoportero comparten cliente     |
| **LSP**   | `TerminalFacial` y `MockProvider` cumplen el mismo puerto; la suite pasa con los dos     | KPI-12, y el simulado los recorre a los dos         |
| **ISP**   | Ningún `HardwareService`: cuatro puertos pequeños, cada adaptador implementa lo suyo     | Ningún adaptador lanza `NotImplemented`… salvo §8.2 |
| **DIP**   | El dominio declara; `packages/providers` implementa; nada del fabricante sale de ahí     | `frontera-hardware.mjs` en verde                    |

---

## 5 · Trazabilidad

**Cubierto contra simulado:** OE-03 (el desacople, verificado por no haber tocado
dominio ni aplicación) · RN-02, RN-03, RN-17 (el receptor entrega al mismo caso
de uso) · RN-08 y CA-20 (la apertura del videoportero exige operador) · RN-09 y
RN-10 (la consola solicita el consentimiento y **no puede aceptarlo**) · RN-21
(ninguna credencial en código ni en respuesta) · KPI-11 y KPI-12.

**Pendiente de medición contra hardware — nueve indicadores, y se dicen con esas
palabras:**

| KPI    | Qué mide                    | Umbral          |
| ------ | --------------------------- | --------------- |
| KPI-13 | Latencia de apertura        | < 3 s           |
| KPI-14 | Cobertura de dispositivos   | Todos operables |
| KPI-17 | Falso rechazo (FRR)         | < 5 %           |
| KPI-18 | Falsa aceptación (FAR)      | < 0,1 %         |
| KPI-22 | Completitud de auditoría    | 0 sin evento    |
| KPI-26 | Cobertura de sabotaje       | 100 %           |
| KPI-27 | Tasa de falsa alarma        | < 5 %           |
| KPI-32 | Latencia de apertura remota | < 3 s           |
| KPI-33 | Latencia de audio y vídeo   | < 2 s           |

Ninguno de los nueve se puede medir sin los equipos. El guion de puesta en
marcha mide KPI-13 y KPI-32 en cuanto haya aparatos; los demás exigen sesiones
de prueba con personas y vehículos.

**Los tres hitos técnicos del reto siguen SIN ejecutar de punta a punta con
hardware real.** El prototipo funcional está; la prueba LPR real y la prueba
facial real, no.

---

## 6 · Pruebas

### Suites

| Paquete          | Pruebas | Nuevas en esta etapa                                        |
| ---------------- | ------: | ----------------------------------------------------------- |
| `@ncr/providers` |     146 | +68: catálogo, transporte, terminal, videoportero, simulado |
| `@ncr/api`       |     857 | +44: receptor, registro de equipos, recorrido de placa      |
| `@ncr/web`       |     376 | +25: medidas de calidad, pantalla de captura, panel         |
| Flutter          |     160 | sin cambios; el cliente generado sí se regeneró             |

`@ncr/api` informa además **5 omitidas**, que son las de siempre y no son de
esta etapa. Las cifras definitivas y el veredicto literal, más abajo.

### Los tres defectos que encontraron los controles al construir esto

| Control                 | Qué encontró                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontera-hardware.mjs` | El guion de puesta en marcha escribía el XML de la barrera y llevaba el nombre del fabricante en su ruta de fichero                                          |
| La prueba de banderas   | La ruta de **apertura** del canal de audio no estaba marcada como «deja rastro»: el guion la habría sondeado, quitándole el canal a quien estuviera hablando |
| La suite de aislamiento | El receptor contestaba **500** donde debía contestar 401: sin la marca `_body`, `express.json` esperaba un flujo ya consumido                                |

### D-101 · **segunda aparición, y esta vez CON NOMBRE**

La roja intermitente de `@ncr/api` apareció durante esta etapa, en la corrida
194 de CI sobre `834ffae` —un commit que **sólo añadía un guion de shell**, sin
una línea de API—. Van **46 intentos y 2 apariciones**.

Lo que cambia respecto de la primera vez: **el instrumento de D-100 funcionó y
la nombró**.

```
✗ XSS reflejado · la respuesta nunca es interpretable como HTML
  toda respuesta viaja como JSON y con nosniff, también las de error
  en apps/api/test/xss.e2e.test.ts
   SUITE EN ROJO · 1 prueba(s) fallaron de 818
```

Es la primera vez en cuarenta y seis corridas que se sabe **qué** prueba es.
La de la ETAPA 13 no dejó nombre.

**Y el instrumento de D-101 NO funcionó, que es el segundo hallazgo.** La
ETAPA 14 añadió la conservación de los informes JSON y su subida como artefacto
«cuando el trabajo falla». En su primera oportunidad real la subida dijo:

```
No files were found with the provided path: .informes-de-prueba/*.json.
```

El motivo: `.informes-de-prueba/` **empieza por punto**, y
`upload-artifact@v4` excluye lo oculto por omisión. Los informes se escribieron
—de ahí salió el nombre de la prueba— y la subida los ignoró en silencio, con
`if-no-files-found: ignore` tapando el aviso. Corregido: `include-hidden-files:
true` y `warn` en vez de `ignore`.

**Lo que NO se puede afirmar todavía:** la causa. Quince intentos dirigidos del
fichero bajo carga de CPU en este contenedor no la reprodujeron. El hecho de que
aparezca sobre un commit que no toca la API descarta que sea del cambio, y el
nombre acota la búsqueda a un fichero de ocho pruebas. **Sigue ABIERTA.**

### Y un defecto de prueba, que también cuenta

La prueba del caso «sin equipo acreditado» pasaba `undefined` a un parámetro con
valor por omisión, así que **rellenaba el valor por omisión y probaba el caso
contrario**, en verde.

---

## 7 · Verificación de seguridad (§2.7)

| Medida                | Estado en esta etapa                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secretos              | Ninguno nuevo. El escaneo pasa sobre 1 240 ficheros del índice                                                                                   |
| Direcciones de equipo | Ninguna en el árbol. KPI-11 en verde, y rechazó dos intentos durante la construcción                                                             |
| Validación            | El sobre se acota en **tres dimensiones**: tamaño total, número de partes y tamaño de parte                                                      |
| Anti inyección        | Sin analizador de XML completo: lo que llega es pequeño y de forma conocida, y un analizador traería XXE al único extremo que no presenta sesión |
| Rate limiting         | Tope por IP elevado en la ruta de publicación, como en la ingesta firmada (D-28)                                                                 |
| Aislamiento           | La copropiedad sale del **equipo acreditado**, no del cuerpo: la cámara no la elige                                                              |
| RN-21                 | La credencial del equipo no aparece en código, ni en la respuesta, ni en el informe del guion                                                    |

### H-15-1 · el hallazgo, con su severidad y su endurecimiento pendiente

**Severidad: media.** La acreditación del receptor —secreto largo por equipo más
origen— es **más débil que la firma HMAC** que exige `POST /ingesta/eventos`. No
da integridad del cuerpo, ni anti-repetición, ni resiste a quien vea la URL, ni
resiste a suplantación de origen en una red plana.

**Por qué se acepta:** la cámara no puede firmar y no hay ajuste del equipo que
lo cambie. La alternativa —debilitar la firma de `/ingesta/eventos` para que
entrara por ahí— la debilitaría también para el Edge, que sí firma.

**Endurecimiento pendiente, por orden de valor:** (1) **VLAN dedicada de
equipos**, que convierte la comprobación de origen en una barrera real; (2) TLS
con certificado de cliente, si el firmware lo admite —sin confirmar—; (3)
rotación del secreto por equipo. **Mientras (1) no exista, la medida real es la
segmentación de red, no este código**, y así está escrito junto a él.

---

## 8 · Deuda, hallazgos y supuestos

### 8.1 · Lo que NO se construyó, y por qué

| Elemento                              | Por qué                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/guias/INTEGRACION_HIKVISION.md` | La guía estrella de §6 tiene diez apartados escritos para ejecutarse **frente al equipo**. Escribirla sin haber tocado ninguno produciría diez apartados de suposiciones con aspecto de procedimiento. §8 de la guía de validación cubre lo ejecutable hoy |
| Descubrimiento ONVIF                  | Inventariar la red del conjunto exige estar en esa red                                                                                                                                                                                                     |
| Controlador de E/S y sabotaje         | KPI-26 se mide abriendo un gabinete                                                                                                                                                                                                                        |
| Vídeo RTSP → WebRTC                   | El puente de vídeo necesita un flujo real que medir                                                                                                                                                                                                        |
| Mapa de errores del fabricante        | Hoy sólo se distinguen `notSupport`, `404` y `401`, que son los tres que el simulado puede producir. El mapa completo se escribe con los códigos que devuelvan los aparatos                                                                                |

### 8.2 · `NotImplemented`, declarado

El transporte de audio de `IntercomDeEquipo` **lanza**. Es la única violación
deliberada de ISP en el proyecto y está aquí porque la alternativa —devolver
silencio— haría creer a la consola que el canal funciona. Se cierra cuando se
midan códec, cadencia y duplex.

### 8.3 · Las dos excepciones a la regla dura

Ninguna toca dominio ni aplicación; las dos son de **presentación**:

1. **`superadministrador` en dos rutas de biometría.** No había ninguna
   superficie por la que adjuntar un rostro desde la consola, y este proyecto no
   da jerarquía implícita a los roles —`GuardaDeRoles` compara pertenencia, no
   rango—, así que omitirlo lo dejaba fuera de verdad. No relaja RN-10.
2. **El techo del dato biométrico sube de 16 KiB a 256 KiB de base64.** La
   terminal construye la plantilla a partir de una **imagen** y no acepta un
   vector nuestro, así que con el techo anterior el recorrido facial no cabía.
   El navegador reduce a 640 px antes de enviar (minimización, Ley 1581 art. 4).

> **Y una incomodidad que hay que nombrar:** el campo se llama `vector` y su DTO
> decía «no es la fotografía». Con esta terminal **sí lo es**. Está dicho en el
> DTO, en la pantalla y aquí; renombrarlo tocaría el contrato de la app móvil y
> se difiere.

### 8.4 · Deuda nueva

| Id        | Qué                                                                                                                               | Se salda en |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **D-125** | Doce rutas DOCUMENTADAS, NO VERIFICADAS. El guion las confirma o desmiente en sitio                                               | Con equipos |
| **D-126** | `INTEGRACION_HIKVISION.md` sin escribir: exige la sesión con hardware                                                             | Con equipos |
| **D-127** | El transporte de audio lanza: faltan códec, cadencia y duplex medidos                                                             | Con equipos |
| **D-128** | El campo `vector` transporta una imagen con esta terminal; el nombre miente                                                       | ETAPA 16    |
| **D-129** | `medirCaptura` depende de `FaceDetector`, ausente en la mayoría de navegadores de escritorio: el encuadre lo confirma quien opera | ETAPA 16    |
| **D-130** | El modo de la terminal se declara por configuración y **nada comprueba** que coincida con el del aparato                          | Con equipos |

### 8.5 · Supuestos

`[SUPUESTO]` Las doce rutas documentadas corresponden a la forma ISAPI habitual
de cada familia. **No se han visto contra estos firmware**, y el catálogo lo
dice en cada entrada.

`[SUPUESTO]` El recorte de placa es siempre la menor de las dos imágenes del
sobre. Se usa como desempate cuando los nombres de parte no dicen nada.

---

## 9 · Qué debe hacer usted

1. **`pnpm --filter @ncr/providers build`** y luego
   `node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar`.
   Empiece sin accionar: hay relés de por medio.
2. Repita **sin** `--sin-accionar` cuando no haya nadie delante de la barrera.
   Mida lo que salga: ésa es la primera cifra real de KPI-13.
3. **Cámara:** desactive la apertura por lista local y apunte la subida HTTP a su
   equipo. Guía §8.2. **Anote el estado previo de cada casilla.**
4. **Terminal facial:** averigüe si admite reportar sin abrir. Guía §8.3. Es la
   pregunta que decide la arquitectura del recorrido facial.
5. **Videoportero:** habilite el canal de audio y anote códec y duplex. Guía §8.4.
6. Pruebe el recorrido de placa **sin cámara** primero (guía §8.5): si eso abre y
   la cámara real no, el problema está en la configuración del equipo. Es la
   única forma de separar las dos cosas sin adivinar.
7. Péguemelo. Cada ruta desmentida se corrige **en el catálogo**, en un sitio.

---

## 10 · Rama y commits

**Rama:** `etapa-15-integracion-hikvision`, sacada de `develop` (`b9d2a60`).

| Commit    | Qué                                                                 |
| --------- | ------------------------------------------------------------------- |
| `834ffae` | Guion del punto de control 1: que el relé responda                  |
| `e4db5af` | El receptor del «servidor de alarma», sin decidir nada              |
| `75429b4` | Terminal facial, transporte común y catálogo de rutas               |
| `aa8f63d` | Captura de rostro desde el escritorio                               |
| `ba66a71` | Videoportero: apertura atribuida y canal de audio escrito y apagado |
| `ebe5d3a` | El equipo simulado que habla como los tres                          |
| `01cfe81` | El resultado de la última sincronización en el panel                |
| `5816a2d` | Guion de puesta en marcha y §8 de la guía                           |
| `0778cee` | KPI-11: el guion deja de conocer rutas y cuerpos                    |
