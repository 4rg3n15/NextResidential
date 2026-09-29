# Visita del 29/09 · los ajustes en la web de cada equipo

> **ETAPA 15-M.** Complementa a [`ENTREGA_EN_SITIO.md`](ENTREGA_EN_SITIO.md), que
> sigue siendo el guion del día. Aquí va sólo lo que hay que tocar **en el panel
> web de cada equipo** y cómo comprobar, desde la plataforma, que quedó bien.
>
> **Ninguna ruta de menú de esta guía está verificada contra la documentación
> del modelo.** Los manuales de usuario de la DS-TCG405-E (V5.4.0), la
> DS-K1T344MBFWX-E1 (V4.61.0) y el DS-KD9633-WBE6 (V2.3.9) no están en el
> repositorio (`docs/hikdocs/` no se versiona) ni al alcance de quien escribió
> esta guía. Por eso **cada ruta va marcada `[SUPUESTO]`** y el nombre del menú
> puede variar con el idioma y el firmware.
>
> **Lo que sí está verificado es la comprobación.** Cada ajuste tiene una línea
> en la ficha del equipo o un paso de `pnpm sitio:ensayo` que lee el valor del
> propio aparato por ISAPI. Si la ruta de menú no coincide, busque el ajuste por
> su nombre en el panel y dé por buena la configuración sólo cuando la
> comprobación de la plataforma diga «conforme» u «OK».
>
> Direcciones: en esta guía, el receptor huérfano que traen los tres equipos se
> escribe **192.0.2.140:8080** (dirección de documentación, RFC 5737). En el
> sitio verá la dirección real en la ficha; no la copie a ningún documento.

## Índice

- [0 · Orden de la visita](#0--orden-de-la-visita)
- [1 · Cámara LPR DS-TCG405-E](#1--cámara-lpr-ds-tcg405-e)
- [2 · Terminal facial DS-K1T344MBFWX-E1](#2--terminal-facial-ds-k1t344mbfwx-e1)
- [3 · Videoportero DS-KD9633-WBE6](#3--videoportero-ds-kd9633-wbe6)
- [4 · Lo que ya no se toca en el panel](#4--lo-que-ya-no-se-toca-en-el-panel)
- [5 · Si algo no cuadra](#5--si-algo-no-cuadra)

---

## 0 · Orden de la visita

1. **Respaldo antes de tocar nada.** Uno por equipo, identificado por familia
   y número de serie. Si dos fichas de la consola dan la misma serie, el
   respaldo lo dice y no pisa ninguno: revise la IP de esas fichas.
   ```
   pnpm sitio:ensayo -- --capturar=$HOME/ncr-sitio/respaldo
   ```
2. **Lectura sin mover nada**, para saber qué hay que cambiar:
   ```
   pnpm sitio:ensayo -- --solo-lectura
   ```
3. **Los ajustes de esta guía**, equipo por equipo, en su panel web o desde la
   ficha de la consola cuando la ficha ofrece «Corregir».
4. **El ensayo de cada equipo**, uno a uno, por el nombre de su ficha:
   ```
   pnpm sitio:ensayo -- --equipo="<nombre de la ficha>"
   ```
5. La lista de verificación del final de
   [`ETAPA-15M.md`](../etapas/ETAPA-15M.md#lista-de-verificación-en-sitio).

---

## 1 · Cámara LPR DS-TCG405-E

**La cámara funciona de punta a punta desde el 28/09.** No cambie nada que no
esté en esta tabla. Si la ficha dice «conforme» en una fila, no la toque.

| Ajuste                                 | Valor                                                                         | Dónde, en su panel web `[SUPUESTO]`                                                                    | Cómo lo comprueba la plataforma                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receptor de eventos (servidor alarmas) | La IP del Mac en la red de la cámara, el puerto de la API y `/alarm-server/…` | **No se escribe a mano.** Consola → Dispositivos → la cámara → ficha → **«Enviar eventos a este Mac»** | La acción escribe el receptor y lo **relee**; sólo dice «aplicada» si quedó apuntando al Mac. Paso 4 del ensayo: la plataforma registra el evento de un vehículo real     |
| Imágenes que envía al receptor         | `detectionPicture` (la imagen de la detección), nunca «todas»                 | Configuración → Red → Configuración avanzada → Notificación HTTP → tipo de imagen                      | Ficha, fila «qué imágenes envía»: si no es `detectionPicture`, la ficha ofrece **«Corregir»** y lo relee                                                                  |
| País del algoritmo                     | **210** (Colombia)                                                            | Configuración → Evento → Detección de vehículo → Parámetros de reconocimiento → País/Región            | Ficha, fila «país del algoritmo», y paso 3 del ensayo. Si el equipo no lista 210, la plataforma lo dice y no escribe nada                                                 |
| «Paso automático» (lista blanca)       | **Apagado**: la cámara no abre sola                                           | Configuración → Evento → Detección de vehículo → Lista blanca / Barrera → Paso automático              | Ficha, fila «quién controla la barrera» (y «disparador vinculado»). Paso 3 del ensayo. Con el paso automático encendido, la cámara decide y la plataforma deja de decidir |
| Zona horaria                           | **(GMT-05:00) Bogotá**                                                        | Configuración → Sistema → Configuración del sistema → Hora                                             | Paso 2 del ensayo: hora del equipo frente al Mac y zona                                                                                                                   |
| Sincronización de hora                 | **NTP** (servidor de la red del conjunto) o «sincronizar con el PC»           | Mismo menú de hora → Modo de sincronización                                                            | Paso 2 del ensayo. Un desvío mayor de lo tolerado abre **una** alerta informativa con el valor, no una por lectura                                                        |
| Autenticación RTSP                     | **digest**                                                                    | Configuración → Sistema → Seguridad → Autenticación → RTSP                                             | Paso 7 del ensayo. La cámara **no tiene el canal 102**: elija el canal en la ficha, de la lista que el propio equipo declara                                              |
| Receptor huérfano                      | Ninguno apuntando a 192.0.2.140:8080                                          | Configuración → Red → Configuración avanzada → Notificación HTTP: borrar la entrada huérfana           | Ficha, bloque «receptores»: cada uno con su dirección y si es el de esta plataforma                                                                                       |

> **El receptor de la cámara ya no depende del `.env`.** Una cámara dada de alta
> desde la consola recibe su propio secreto de Alarm Server, cifrado en la base.
> La cámara del 28/09 sigue usando el de `ALARM_SERVER_EQUIPOS`, sin cambios.

---

## 2 · Terminal facial DS-K1T344MBFWX-E1

La consola mostraba **V4.47.0**, que venía de un sondeo antiguo. Si la
terminal no contesta hoy, la ficha enseña ahora el modelo y el firmware
guardados con **«dato del DD-MM-YYYY»**: no son de hoy.

| Ajuste                 | Valor                                                | Dónde, en su panel web `[SUPUESTO]`                                          | Cómo lo comprueba la plataforma                                                                                                |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Receptor de eventos    | **Ninguno.** La plataforma **escucha** a la terminal | Consola → ficha → **«Desactivar el receptor huérfano»**, con motivo          | La acción lo apaga y lo relee, y queda en la auditoría. Paso 4 del ensayo: la escucha entrega el evento de una cara presentada |
| Receptor huérfano      | Ninguno apuntando a 192.0.2.140:8080                 | Configuración → Red → Configuración avanzada → Escucha HTTP (HTTP listening) | Ficha, bloque «receptores»                                                                                                     |
| Zona horaria           | **(GMT-05:00) Bogotá**                               | Configuración → Sistema → Hora                                               | Paso 2 del ensayo. Con la zona mal, las vigencias de los visitantes se corren horas en la terminal                             |
| Sincronización de hora | **NTP** o «sincronizar con el PC»                    | Mismo menú de hora                                                           | Paso 2 del ensayo                                                                                                              |
| Verificación remota    | **Activada**, con plazo de 8 s                       | **No se toca en el panel.** Consola → ficha → «Verificación remota: activar» | Paso 9 del ensayo: cinco presentaciones y el p95 del veredicto frente a `TERMINAL_PLAZO_DE_VERIFICACION_S`                     |
| Autenticación RTSP     | **digest**                                           | Configuración → Sistema → Seguridad → Autenticación → RTSP                   | Paso 7 del ensayo. El canal 102 en H.264 funcionó el 28/09                                                                     |

Los rechazos de foto del 28/09 **no eran la calidad de la imagen**: eran el
falso «rechazó el usuario o la clave» (E1). Ya no hay nada que ajustar en la
terminal para eso. El paso 6 del ensayo da de alta y de baja una persona de
prueba con su cara, con la foto de `$HOME/ncr-sitio/cara.jpg`.

---

## 3 · Videoportero DS-KD9633-WBE6

| Ajuste                        | Valor                                                      | Dónde, en su panel web `[SUPUESTO]`                                          | Cómo lo comprueba la plataforma                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receptor de eventos           | **Ninguno.** La plataforma **escucha** al videoportero     | Consola → ficha → **«Desactivar el receptor huérfano»**, con motivo          | La acción lo apaga, lo relee y queda auditada. Paso 4 del ensayo: pulsar el timbre produce el evento                                                                                                            |
| Receptor huérfano             | Ninguno apuntando a 192.0.2.140:8080                       | Configuración → Red → Configuración avanzada → Escucha HTTP (HTTP listening) | Ficha, bloque «receptores»                                                                                                                                                                                      |
| Audio bidireccional           | Canal 1 habilitado, códec **G.711** (µ-law)                | Configuración → Video/Audio → Audio → Tipo de codificación: G.711ulaw        | Paso 3 del ensayo: «canal de audio bidireccional: canal 1 · g711u». Paso 8: el canal se abre y el pitido se oye                                                                                                 |
| Autenticación RTSP            | **digest** (o «digest/basic» si el firmware lo ofrece)     | Configuración → Sistema → Seguridad → Autenticación → RTSP                   | Paso 7 del ensayo. El 28/09 dijo «credencial rechazada por RTSP» con la misma clave que HTTP acepta. Ahora el paso anota qué esquema ofreció el equipo y cuál se envió, sin la clave: copie esa línea a la hoja |
| Vista en vivo para el usuario | El usuario `admin` con permiso de **vista en vivo remota** | Configuración → Usuarios → `admin` → Permisos                                | Paso 7 del ensayo                                                                                                                                                                                               |
| Zona horaria                  | **(GMT-05:00) Bogotá**                                     | Configuración → Sistema → Hora                                               | Paso 2 del ensayo                                                                                                                                                                                               |
| Sincronización de hora        | **NTP** o «sincronizar con el PC»                          | Mismo menú de hora                                                           | Paso 2 del ensayo                                                                                                                                                                                               |

**Rostros en el videoportero.** No hay nada que activar en el panel. La
plataforma lee lo que el equipo declara y da de alta como el equipo lo admite.
El 28/09 declaró personas sólo de tipo `normal` y una biblioteca con `post` y
sin `setUp`. Con eso, la persona entra como `normal` con su vigencia en `Valid`
y la cara se sube por `POST FDLib/FaceDataRecord`. Si el equipo no declara
ninguna operación de carga, la plataforma no da de alta ni la persona y lo
dice. El paso 6 del ensayo lo prueba de punta a punta.

> Las rutas del videoportero para personas y rostros están **documentadas, no
> verificadas** contra su manual ISAPI (S-107). Los extractos pedidos están en
> el informe de la etapa.

---

## 4 · Lo que ya no se toca en el panel

- **La lista de equipos vive en la consola.** El ensayo, la puesta en marcha y
  el respaldo leen los equipos dados de alta en la consola, N de cada tipo, con
  cualquier IP. `BARRERA_*`, `TERMINAL_*` y `VIDEOPORTERO_*` del `.env` quedan
  sólo de respaldo si la base no está.
- **El canal de video** se elige en la ficha, de la lista que el equipo
  declara, con su códec.
- **Las alertas viejas** se archivan desde Eventos, individualmente o en lote,
  con motivo. No se borran.
- **Un equipo que se retira** se da de baja desde Dispositivos, con motivo. Sus
  rostros se retiran del equipo antes, y los que el equipo no quite quedan
  declarados como pendientes.

---

## 5 · Si algo no cuadra

| Qué ve                                                | Qué significa                                                              | Qué hacer                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| «El equipo … acaba de rechazar el usuario o la clave» | Se presentó la credencial en un intercambio limpio y el equipo dijo que no | Revise usuario y clave en la ficha. Guardar la credencial o **«Probar conexión»** vuelve a intentarlo una vez |
| «Credencial rechazada por el equipo … hace N min»     | La plataforma no insiste, para que el equipo no bloquee la cuenta          | **«Probar conexión»** borra la marca e intenta una sola vez                                                   |
| «… la cuenta BLOQUEADA: se desbloquea en N s»         | El propio equipo declaró el bloqueo y cuánto le queda                      | Espere ese tiempo antes de volver a probar                                                                    |
| La consola dice «La API no responde»                  | La API está apagada o reiniciándose                                        | Mire la terminal de la API. Si está arrancando, espere unos segundos                                          |
| La consola dice «Servicio no disponible por ahora»    | La API contestó que le falta algo, y el mensaje dice qué                   | Siga el mensaje: por ejemplo, arrancar el puente de video con `pnpm sitio:video`                              |
| El video dice «go2rtc no está en marcha»              | El puente de video del Mac está apagado                                    | `pnpm sitio:video`                                                                                            |
| El video dice que el equipo no tiene ese canal        | El canal elegido no existe en ese equipo                                   | Elija otro canal en la ficha, de la lista del equipo                                                          |
