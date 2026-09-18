# ETAPA 11 — App móvil Flutter del residente · **11-A**

`etapa-11-app-flutter-residente` · OE-02 (lectura) · HU-05, HU-33 · las pantallas M-1, M-2, M-3, M-6 y M-8

> **La etapa se ejecuta en dos mitades, aprobadas por el usuario.** El corte no
> es por tamaño: **11-A se recorre entera en un emulador sin conceder un permiso
> del sistema ni cortar la red; 11-B no se puede demostrar sin ninguna de las
> dos cosas.** Este informe cierra 11-A.

---

## 1 · Qué se construyó

Lo primero que apareció al abrir la etapa no fue una pantalla: fue que **el
residente no tenía servidor**. `POST /copropiedades/:id/autorizaciones` admite
administrador, superadministrador y portero; `GET …/eventos` admite esos tres y
el operador de central; el padrón entero cuelga de rutas de administración. Es
decir, HU-07 a HU-09 y HU-33 —que son OE-02, el corazón del producto— no tenían
endpoint por el que ocurrir. La ETAPA 11 no era «pintar ocho pantallas»: era
construir la mitad del servidor que faltaba.

De ahí salió lo más valioso de esta mitad, que es una barrera y no una pantalla:
**el segundo eje del aislamiento**. Hasta aquí el sistema aislaba por
copropiedad, que es lo correcto para los cinco roles que administran u operan.
El residente no encaja: su alcance legítimo es **una vivienda**. Un residente
que alcanzara el padrón de su conjunto vería las autorizaciones, los vehículos y
el historial de sus vecinos —quién los visita, con qué placa, a qué hora entran—
y eso es tan grave como ver los de otro conjunto.

Encima de esa base está la app: proyecto Flutter con arquitectura limpia, cliente
Dart **generado** desde el contrato OpenAPI, sesión en el llavero del sistema,
refresco proactivo al volver a primer plano, los cinco estados transversales como
tipo, y cinco de las ocho pantallas del mockup.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · La vivienda NUNCA llega en la petición

Es la decisión que hace innecesaria la mitad de las comprobaciones. El ámbito del
residente se deriva de su identidad (`usuarios → personas → residentes →
viviendas`) en un puerto propio, `DirectorioDelResidente`, y ningún método de ese
puerto acepta un `viviendaId` venido de fuera.

Si el cliente no puede **nombrar** una vivienda, no puede pedir la del vecino.
Lo que sí puede nombrar son recursos de segundo nivel —una autorización, un
evento—, y para eso está `alcanzaVivienda` en `domain-core`: una función pura,
con prueba por rama, que deniega por defecto (un recurso sin vivienda no alcanza
a nadie) y que compara **también** la copropiedad, porque un UUID no lleva
escrito de qué conjunto es.

La barrera vive en el dominio y no en un `WHERE` del repositorio por la misma
razón que el motor de reglas: una comparación escrita en cada consulta se olvida
en la consulta número once.

### 2.2 · La superficie cuelga de `copropiedades/:id/mi/…`, y eso es deliberado

Lo natural habría sido `/mi/vivienda`, sin copropiedad. Habría sido un error:
**la suite de aislamiento del primer eje recorre el enrutador** y trata cualquier
2xx sobre un identificador ajeno como fuga. Una ruta sin copropiedad queda fuera
de ese recorrido — una exención en silencio, justo en la superficie nueva. Con la
copropiedad en la ruta, las cinco rutas entran solas en el barrido de siempre, y
el segundo eje se comprueba aparte.

### 2.3 · La suite del segundo eje rompe el build, y su lista sale del código

`aislamiento-residente.e2e.test.ts` no lleva una lista escrita a mano de rutas:
la **deriva** del enrutador con `rutasConRol(app, 'residente')`. Una ruta nueva
marcada `@Roles('residente')` sin comprobación de vivienda deja de cuadrar y la
suite se pone roja **el día que se añade**, que es el único día en que el autor
tiene el contexto para arreglarla.

Y lleva su línea base: exige que el vecino **sí** tenga datos visibles para su
propio residente. Sin esa mitad, «no filtra» pasaría en verde con respuestas
vacías, y esta suite sería la enésima aparición del patrón que el repositorio
persigue.

**Encontró dos cosas en la primera ejecución** (§8).

### 2.4 · El refresco es proactivo, no perezoso

El token de este proyecto dura **cinco minutos** y una app móvil pasa horas
suspendida. Con refresco perezoso, el regreso se ve así: la pantalla se pinta con
lo que había, la primera petición sale con un token muerto, llega un 401, y hay
que renovar y reintentar —con otras tres peticiones en paralelo que también
fallaron—. Si el refresco también falla, el residente ve «sesión expirada»
**después** de que la app le enseñara su casa.

Aquí la política es una función pura del dominio, `accionPara(sesion, ahora)`,
con el instante por parámetro, y el armazón la consulta **al volver a primer
plano, antes de la primera lectura**. El 401 se sigue tratando —un token puede
revocarse en el servidor— pero con un reintento único y como excepción.

Y el modo de fallo que convierte «refresqué al volver» en «me echó al volver»:
cuatro pantallas pidiendo datos al reanudar son cuatro renovaciones simultáneas,
y Supabase **rota** el token de refresco en cada uso, así que la primera invalida
a las otras tres. `SesionEnUso` comparte una sola promesa; hay prueba con el
completador bloqueado que lo demuestra.

### 2.5 · Los cinco estados transversales son un TIPO

El hallazgo más voluminoso de la auditoría de mockups: las 18 pantallas dibujan
**solo el camino feliz con datos**. Con un `bool cargando` y un `String? error`
por pantalla, el quinto estado se olvida en la tercera. `Estado<T>` es una unión
sellada y el `switch` de la interfaz no compila si falta una rama; `cargar()` es
el único sitio donde una excepción se convierte en estado. Cada rama ofrece lo
que corresponde: reintentar ante una caída de red, **nada** ante un «sin
permiso» —insistir no lo arregla—, y una explicación ante «sin vivienda», que es
un estado previsto de M-1 y no un error.

### 2.6 · Lo que el mockup dibuja y aquí no funciona, lo dice

Las pestañas **Visitantes** (M-4) y **Zonas** (M-5) están en la barra, con su
motivo escrito y el identificador del mockup. Los tres interruptores de
preferencias de M-8 están, **deshabilitados**: no hay dónde guardar esa
preferencia ni quién la respete hasta que FCM llegue en 11-B, y un interruptor
que se mueve sin guardar nada es una mentira con animación. Es la misma decisión
que tomó la ETAPA 10 con el vídeo de la guardia virtual.

---

## 3 · Árbol de archivos

| Archivo                                                      | Para qué                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `packages/domain-core/src/residente/ambito-del-residente.ts` | El segundo eje: `alcanzaVivienda`, `ambitoDelResidente`. Puro        |
| `apps/api/src/residente/aplicacion/puertos.ts`               | `DirectorioDelResidente`: ningún método acepta una vivienda de fuera |
| `apps/api/src/residente/aplicacion/casos-de-uso.ts`          | `ResolverMiAmbito` + las cinco lecturas                              |
| `apps/api/src/residente/infraestructura/directorio-pg.ts`    | SQL con `copropiedad_id` **y** `vivienda_id` en toda consulta        |
| `apps/api/src/residente/presentacion/mi.controller.ts`       | `copropiedades/:id/mi/…`, solo rol `residente`                       |
| `apps/api/test/aislamiento-residente.e2e.test.ts`            | El barrido del segundo eje, con su línea base                        |
| `apps/api/test/dobles/directorio-del-residente.ts`           | Doble con **dos** viviendas pobladas en la misma copropiedad         |
| `apps/mobile/lib/dominio/sesion.dart`                        | La política de refresco, pura y con reloj inyectado                  |
| `apps/mobile/lib/aplicacion/estado.dart`                     | Los cinco estados como unión sellada                                 |
| `apps/mobile/lib/aplicacion/sesion_en_uso.dart`              | Refresco proactivo y **una sola** renovación concurrente             |
| `apps/mobile/lib/infraestructura/api/generado/**`            | Cliente Dart generado (170 ficheros). No se edita a mano             |
| `apps/mobile/lib/infraestructura/api/repositorio_api.dart`   | DTO → entidades; `DioException` → fallo tipado; reintento único      |
| `apps/mobile/lib/infraestructura/sesion/almacen_seguro.dart` | Keychain / Keystore, y memoria en web porque allí no existe          |
| `apps/mobile/lib/presentacion/**`                            | Armazón, cinco estados dibujados una vez, y las cinco pantallas      |
| `apps/mobile/e2e/recorrido-web.mjs`                          | El recorrido en un navegador de verdad, con capturas                 |
| `packages/providers/src/hikvision/contratos-de-evento.ts`    | Los **dos** contratos de evento, con su normalización probada        |
| `scripts/lib/coherencia-estado-etapas.mjs`                   | La regla del DoD, ejecutable                                         |
| `scripts/lib/cobertura-flutter.mjs`                          | Cobertura de Dart **por capa**                                       |
| `scripts/lib/flutter-sin-secretos.mjs`                       | Ningún secreto en el binario                                         |
| `scripts/lib/cliente-dart-desfasado.mjs`                     | El cliente Dart coincide con el contrato                             |

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa aquí                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | `ResolverMiAmbito` resuelve el ámbito y no lee datos; el directorio lee y no decide; `VistaConEstado` pinta estados y no los produce                             |
| **OCP**   | Una pantalla nueva es un `ControladorDeVista` más: no toca la máquina de estados ni el armazón. Un motivo de negación nuevo es una línea en `motivoLegible`      |
| **LSP**   | `RepositorioDelResidente` tiene dos implementaciones —la de API y la falsa de pruebas— y las pantallas no distinguen cuál tienen delante                         |
| **ISP**   | El directorio del residente es un puerto **nuevo** y no tres métodos más en `RepositorioPadron`: aquel responde preguntas de administración, cuyo ámbito es otro |
| **DIP**   | El dominio de Dart declara `RepositorioDelResidente`, `AlmacenDeSesion`, `Autenticador` y `Reloj`; nada de `lib/dominio` sabe qué es Dio ni Keychain             |

---

## 5 · Trazabilidad

**Cubiertos:** HU-05 y HU-06 (lectura) · HU-33 · HU-02 (lectura) · RN-05 y RN-15
(segundo eje) · RN-13 (la app lo dice y el servidor lo decide) · RN-19 (el
desactivado se muestra marcado) · §2.7.1 (ningún secreto en el binario) · §2.7.6
(los dos ejes) · KPI-31 (lo decidido por el Edge se marca en el historial).

**Parcialmente cubiertos, con su motivo:**

- **HU-07 a HU-09 (crear autorización).** La lectura está; la escritura es 11-B,
  con el patrón de recurrencia, los acompañantes nominales y las zonas.
- **HU-19 (zonas).** La pestaña existe y dice qué falta. La ruta acotada por
  vivienda que sustituye a la que se retiró por D-76 llega en 11-B.
- **HU-34 (notificaciones).** El registro de token FCM es de 11-B; hasta
  entonces el `NotificadorPush` de la API anota y no envía, como está declarado
  desde la ETAPA 10.
- **HU-11 a HU-15 (biometría).** La captura con validación de calidad es de
  11-B.
- **KPI-10 (autorización en menos de 60 s).** No se puede medir sin la pantalla
  que autoriza. Se mide en 11-B, y publicar una cifra antes sería peor que no
  tenerla.

---

## 6 · Pruebas

**Qué se probó, y qué se vio fallar antes de confiar en ello:**

| Control                                | Mutación con la que se comprobó                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| El segundo eje                         | El doble en memoria con **dos** viviendas: la del vecino tiene marcas que la prueba busca en el cuerpo |
| La lista de rutas del residente        | Salió del enrutador y **delató diez rutas que yo no había previsto**, dos de ellas hallazgos           |
| El orden del refresco                  | Autenticador y repositorio escriben en la misma bitácora; la prueba mira el ORDEN, no el hecho         |
| Una sola renovación concurrente        | Completador bloqueado: cuatro `asegurar()` simultáneos, una renovación                                 |
| Los cinco estados                      | Uno por prueba de widget, comprobando qué acción ofrece cada uno                                       |
| El cliente Dart al día                 | Se regenera en un temporal y se compara fichero a fichero                                              |
| El volcado histórico del `alertStream` | Cuatro históricos y un evento vivo: solo se difunde uno                                                |

**Veredicto literal de §2.8.0** — `./scripts/verificar-etapa.sh --con-base`:

```
VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

**25 de 25 pasos ejecutados** —tras la ronda de entorno del 2026-09-18, que
añadió el paso 1c y amplió el 1—, ninguno omitido, con `DATABASE_URL_PRUEBAS`
apuntando a una PostgreSQL 16 local.

| Medida                        | Resultado                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Pruebas de TypeScript         | **1 519** en verde · **119 de 119** ficheros recogidos                           |
| Pruebas de Dart               | **72** en verde                                                                  |
| Cobertura TypeScript          | dominio 97,69 % líneas / 96,43 % ramas · aplicación 97,24 % · global 74,17 %     |
| Cobertura Dart, **por capa**  | dominio 93,94 % · aplicación 98,04 % · global 81,87 % (sin contar lo generado)   |
| Controles con prueba negativa | **17**, cada uno visto fallar ante su propia violación                           |
| Estabilidad                   | tres corridas forzadas sin caché, resultado idéntico                             |
| Recorrido en navegador        | 13 comprobaciones, **ni un error de JavaScript**                                 |
| Con base de datos             | KPI-03 (100 inserciones, 0 duplicados) · RN-03/CA-23 · RN-14/CA-14 · D-71 · D-72 |

**La primera ejecución salió FALLIDA y sus hallazgos eran reales**, los de §8.
Uno fue el más pequeño y el más elocuente: el control de frontera cazó el
nombre del fabricante en un **comentario** de un guion nuevo. Tiene razón —
KPI-11 existe para que el protocolo viva en un solo sitio, y un comentario es
por donde empieza la filtración.

Y una corrida posterior falló por algo que **no** era del repositorio: la
PostgreSQL local de este contenedor murió a mitad, y con ella se cayeron cuatro
pasos con mensajes que hablaban de otra cosa. De ahí la sonda de base del paso
1c: la causa se nombra al principio, no cuarenta minutos después.

---

## 7 · Verificación de seguridad (§2.7)

| Punto              | Estado                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2.7.1 Secretos    | **Control nuevo**: `flutter-sin-secretos.mjs`. La advertencia «todo lo compilado en Flutter es extraíble» llevaba desde la ETAPA 01 sin comprobarse |
| §2.7.3 Validación  | `HistorialQueryDto` valida periodo y tope; el `ValidationPipe` global rechaza cualquier parámetro no declarado                                      |
| §2.7.4 Inyección   | Las cinco consultas del directorio son parametrizadas; el periodo se pasa como número de días, nunca concatenado en un `interval`                   |
| §2.7.5 Límites     | `limite` acotado a 200; autorizaciones con tope de 200 filas                                                                                        |
| §2.7.6 Aislamiento | **Los dos ejes.** El primero por `exigirAlcance` en las cinco rutas; el segundo por el ámbito del dominio, con suite que rompe el build             |
| §2.7.8 RBAC        | Solo `residente`. Un administrador recibe 403 en `/mi`, y hay prueba: abrirlo llevaría a aceptar un `viviendaId` por parámetro                      |
| Sesión en el móvil | Keychain/Keystore; en web, memoria declarada. `avoid_print` como regla: en esta app lo que se pasa por el registro son tokens                       |

---

## 8 · Deuda, hallazgos y supuestos

| ID       | Qué                                                                                                                                                                                                                   | Estado                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **D-76** | `POST …/zonas/:zonaId/autorizaciones` admitía `residente` y el permiso se da a un `autorizacionId` del **cuerpo**, comprobando solo la copropiedad: un residente podía dar acceso a la zona al visitante de su vecino | **Corregido** · rol retirado (denegar por defecto)                   |
| **D-77** | `GET …/biometria/consentimientos/:id` devuelve el estado de cualquier consentimiento del conjunto a quien conozca su UUID. Sin dato biométrico y sin enumeración posible                                              | **Declarado** · se acota por titular en 11-B                         |
| **D-78** | El tema de la app copia los colores del preset de la consola a mano, porque Dart no lee TypeScript                                                                                                                    | **Declarado** · la prueba compara con el `.ts` mientras no se genere |
| **D-79** | El paso 5 del verificador decidía «suite en verde» buscando texto, no mirando el código de salida: con la compilación rota informaba verde **con cero pruebas ejecutadas**                                            | **Corregido** en esta etapa                                          |
| **S-21** | Un residente con vínculo en varias viviendas ve la del titular, o la más antigua                                                                                                                                      | `[SUPUESTO]` · multivivienda sería HU propia                         |
| **P-11** | El «nivel de acceso» del mockup no existe en los requisitos                                                                                                                                                           | Sigue `PENDIENTE DE DEFINICIÓN`; la app lo pinta y lo dice           |

### Ronda de entorno (2026-09-18) · tres rondas perdidas, y por qué

El usuario reportó `PathAccessException` al crear `.dart_tool` en los pasos
móviles, con `flutter pub get` funcionando desde `apps/mobile`. Sus dos
hipótesis —directorio de trabajo equivocado, o un `PUB_CACHE` ajeno— **quedaron
descartadas por medición**: se sustituyó `flutter` por un guion que imprime su
`pwd` y su entorno, y los tres pasos lo invocan desde
`/…/apps/mobile`, con `PUB_CACHE` sin definir; `con-limite.mjs` no pasa `cwd` a
`spawn`, así que el hijo hereda el del shell, que es el correcto.

Lo que sí explica el síntoma es lo que él mismo reportó en la misma frase: **su
Dart era 3.11.5 y el `pubspec.yaml` exige `^3.13.3`**. Con el SDK por debajo del
mínimo, `pub` falla al resolver y, según el estado en que quedara `.dart_tool`,
el error que sale es de permisos y no de versiones. Eso debía nombrarse en el
paso 1. Ahora se nombra.

| ID       | Qué                                                                                                                                                                                                                                           | Estado                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **D-81** | `cumple()` aceptaba `^` en la expresión regular y **no lo interpretaba**: caía al caso por defecto y devolvía `true` para cualquier versión. Se destapó probando la comprobación nueva con un mínimo imposible (`^3.99.0`), que pasó en verde | **Corregido**                          |
| **D-82** | `cliente-dart-desfasado.mjs` usaba el `dart` del PATH, que no tiene por qué ser el del Flutter en uso. Es la configuración que produce «`flutter pub get` funciona y `dart run` falla»                                                        | **Corregido** · el `dart` sale del SDK |

**Lo que se añadió, con su motivo:**

1. **`.flutter-version`** en la raíz, como `.nvmrc`. El mínimo de Dart **no** se
   duplica ahí: se lee de `apps/mobile/pubspec.yaml`, que ya lo declara.
   Duplicarlo garantizaría que un día digan cosas distintas.
2. **Paso 1c · escritura**, por ejercicio y no por `access()`: se crea un
   fichero, se escribe, se lee y se borra en las nueve rutas que las
   herramientas usan —incluidas `.dart_tool`, la caché de pub y el `bin/cache`
   del propio SDK, que Flutter escribe—. `access(W_OK)` mira los bits de
   permiso y no ve un montaje de solo lectura, una ACL de macOS ni un disco
   lleno.
3. **Diagnóstico en los pasos móviles.** Ante un fallo se imprime el comando
   exacto, el directorio absoluto, qué binario de Flutter es y qué versiones
   trae; y se **clasifica**: permisos, desajuste de SDK, módulo de Node ausente
   o directorio sin app se anuncian como **entorno**, con la frase «esto es
   ENTORNO, no código» y el paso que lo detecta. Comprobado con un error de Dart
   introducido a propósito (no lo clasifica como entorno) y con el `pubspec`
   pidiendo `^3.99.0` (sí lo clasifica, y muestra el error de resolución).

---

**Y un aviso sobre el `con_limite` del verificador**, que no es deuda sino
corrección: llamaba al ayudante por ruta relativa, así que cualquier paso dentro
de un subshell con `cd` —los de la app móvil— moría con `MODULE_NOT_FOUND` y
daba rojo por una causa ajena a lo que probaba. Ahora la ruta es absoluta.

---

## 9 · Qué debe hacer usted

1. **Nada para que la suite corra.** Todo lo de esta mitad se verifica sin
   credenciales suyas.
2. **Para probar la app contra su proyecto**, compile con sus valores:

   ```
   flutter build apk --dart-define=API_URL=https://<su-api> \
                     --dart-define=SUPABASE_URL=https://<su-proyecto>.supabase.co \
                     --dart-define=SUPABASE_PUBLISHABLE_KEY=<su llave PUBLICABLE>
   ```

   La app **no arranca** si esa llave empieza por `sb_secret_`: dirá en pantalla
   por qué.

3. **Cree un usuario residente y víncúlelo a una vivienda** desde la consola.
   Sin vínculo, la app muestra «sin vivienda asignada» —que es el estado
   correcto, no un error—.
4. **Para la ETAPA 15**, pegue en `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md`
   §0.quater las tres capturas que faltan: el XML real del Alarm Server, dos
   bloques del `alertStream` (uno histórico y uno vivo) y el modelo y firmware
   del videoportero.

---

## 10 · Rama y commits

**Rama:** `etapa-11-app-flutter-residente`, desde `develop` actualizado.

| Commit                               | Qué trae                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `feat(etapa-11-A/residente)`         | La superficie del residente y el segundo eje del aislamiento |
| `feat(etapa-11-A/movil)`             | La app Flutter y los cuatro pasos nuevos del verificador     |
| `feat(etapa-11-A/movil)` · recorrido | El recorrido en navegador y el paso 5e                       |
| `feat(etapa-11-A/hikvision)`         | Los dos contratos de evento y el simulado que los emite      |
| `chore(etapa-11-A)`                  | Cierre: informe, estado de etapas y README                   |
