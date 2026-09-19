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

### Ronda de entorno (2026-09-19) · `objective_c`, y el control genérico de la familia

**Quién arrastraba `objective_c`.** Medido con `flutter pub deps`, no deducido.
La cadena no es la que parecía:

```
flutter_secure_storage
  └─ flutter_secure_storage_WINDOWS          ← sí: el de Windows
       └─ path_provider                       (federado: arrastra las 5 plataformas)
            └─ path_provider_foundation
                 └─ objective_c 9.5.0
```

Es decir: **la implementación para Windows de un paquete de almacenamiento
arrastraba una dependencia de Apple.** `flutter_secure_storage_macos` no depende
de `objective_c`; `flutter_secure_storage_windows` depende de `path_provider`,
que por ser un plugin federado arrastra las cinco implementaciones de plataforma
—Android, Foundation, Linux, Windows, la interfaz— tanto si se usan como si no.

Y `objective_c` no es una dependencia pasiva: trae `hook/build.dart`, un _native
asset_ de Dart que **compila fuentes `.m` con `clang`**. Su primera línea
útil es `const supportedOSs = {OS.iOS, OS.macOS}`: en Linux devuelve sin hacer
nada —por eso este contenedor jamás lo reprodujo en cinco rondas— y en macOS
compila, lo que exige el SDK de Apple. El fallo salía a cuatro capas de su causa
y hablando de un paquete que este proyecto no declara ni usa.

**La acotación, y por qué es esa.** `path_provider_foundation` 2.5.1 es la última
versión sin `objective_c` (2.5.0 lo adoptó, 2.5.1 lo revirtió, 2.6.0 lo volvió a
meter), y satisface el rango de Flutter y Dart en uso. Un
`dependency_overrides` la fija y **`objective_c` desaparece del `pubspec.lock`
entero**. Verificado aquí: `flutter analyze` sin hallazgos y las 72 pruebas en
verde con la acotación puesta.

No se eligió desactivar los _native assets_ (`FLUTTER_NATIVE_ASSETS=false`):
habría escondido el paquete en lugar de sacarlo, y su efecto depende de una
bandera del entorno que nadie versiona.

| ID       | Qué                                                                                                                                                                                      | Estado                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **D-83** | `objective_c` entraba en el grafo por el plugin de **Windows** de `flutter_secure_storage` y rompía `flutter test` en macOS, en código que la suite no toca                              | **Corregido** · acotado, con control que lo vigila  |
| **D-84** | La lista de pruebas negativas se mantenía **a mano**: un control nuevo podía entrar en el verificador y reportar «✓» sin que nadie hubiera comprobado que sabe decir «✗». Así nació D-81 | **Corregido** · `controles-sin-prueba-negativa.mjs` |

**El control genérico de la familia (D-84).** Es la respuesta a la pregunta de
fondo: veinte defectos —D-79 decidiendo por texto y no por código de salida,
D-80 leyendo `false` al acertar, D-81 aceptando `^` sin interpretarlo, D-82
tomando `dart` del PATH— no comparten tema. Comparten que **nadie los había
visto fallar**. La defensa genérica no es otra comprobación temática: es exigir
que todo control tenga su demostración de fallo, y comprobarlo mecánicamente.

El control deriva dos conjuntos del código, sin tabla que mantener:

- **A** · lo que `verificar-etapa.sh` ejecuta —y lo que ejecutan los `.sh` que
  él invoca, que es como `escanear-secretos.mjs` se contaba fuera—.
- **B** · lo que `pruebas-negativas.mjs` **invoca** de verdad.

Y exige `A ⊆ B`. Lo que no está en B y no está exento es deuda declarada, con
motivo escrito; **esa lista solo puede encoger**: si crece, el paso 9 se pone
rojo, y si una entrada deja de corresponder —porque ya tiene prueba, o porque el
verificador ya no ejecuta ese control— también. Hoy son **18 de 25 con prueba
negativa y 7 en deuda**, y el número sale en pantalla en cada ejecución.

> **Y el control genérico estuvo a punto de nacer con el defecto de la familia.**
> La primera versión contaba un control como «ejercido» si su ruta _aparecía_ en
> la suite negativa. Al escribir el caso 16, mencionar
> `'node scripts/lib/dependencias-acotadas.mjs'` dentro de otra cadena bastó
> para que diera por probado un control que nadie había probado. Ahora exige el
> literal exacto entre comillas, que es la forma real de una invocación. Se
> anota aquí porque es la mejor descripción que tenemos del patrón: **mencionar
> no es ejercer, y un control que confunde las dos cosas es la decimonovena
> aparición.**
>
> Lo que este control **no** cubre todavía: una rama _nueva_ dentro de un
> control que _ya_ tiene prueba negativa. Es exactamente D-81 —`verificar-entorno.mjs`
> tenía su caso 6 desde la ETAPA 02, y la rama del acento circunflejo no—. Para
> eso hace falta granularidad de rama: correr la suite negativa bajo
> `NODE_V8_COVERAGE` y exigir que los propios `scripts/lib/*.mjs` queden
> cubiertos. Es el primer trabajo de 11-B.

**Dos hallazgos que salieron del propio control genérico.** Al comprobar si
`metricas.mjs` estaba exento con razón, resultó que no: el paso 7 **sí** mira su
código de salida, así que es un control. Y mirándolo de cerca aparecieron dos
cosas:

| ID       | Qué                                                                                                                                                                                                                                                                                                                                                 | Estado                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **D-85** | Si la corrida de un paquete no terminaba, `metricas.mjs` se lo callaba (`catch {}` vacío) y el paso 7 anunciaba **«alguna capa por debajo del umbral»**. Pasó en esta ronda: `@ncr/api` no dejó resumen, la capa de **aplicación desapareció del informe** en vez de salir en rojo, y el mensaje mandaba a buscar una cobertura baja que no existía | **Corregido** · se guarda el motivo y el paso lo nombra                          |
| **D-86** | `@ncr/providers` está al **84,58 %** frente al **90 % que él mismo declara** en su `vitest.config.ts` —`intercom-simulado.ts` al 0 %, 147 líneas sin una sola prueba—. Su corrida falla en cada ejecución desde la ETAPA 10 y **ninguna lo había dicho jamás**, porque `metricas.mjs` se tragaba el código de salida                                | **Declarado** · el paso 7 lo imprime; cerrarlo son pruebas del intercom simulado |

Sobre **D-86** conviene ser exacto: no incumple §2.4 —`providers` no es dominio
ni aplicación, y el umbral global del 70 % se cumple—, incumple el listón más
estricto que el propio paquete se puso. Por eso el paso lo **imprime** y no lo
tumba, y por eso **no se baja el umbral**: bajarlo sería cambiar la medida para
que dé el resultado que uno quiere. Lo que falta son pruebas.

Y una nota de honestidad sobre D-85: el fallo de `@ncr/api` **no se reprodujo**
—dos ejecuciones seguidas sin resumen, la tercera con él y con las cifras
exactas de la ronda anterior—, así que la causa raíz sigue sin nombre. Lo que sí
está cerrado es que la próxima vez **el motivo saldrá impreso** en lugar de
disfrazarse de umbral incumplido.

**Las otras dos correcciones de esta ronda:**

1. **Paso 1 · el SDK de macOS, ejecutando `xcrun`.** `xcode-select -p` solo dice
   a qué apunta un enlace: puede apuntar a un Xcode cuyo primer arranque nunca se
   completó o cuya licencia no se aceptó, y entonces **no hay SDK**. El paso
   ejecuta `xcrun --sdk macosx --show-sdk-path`, exige salida no vacía y
   **comprueba que esa ruta existe**. Ejercido en sus cuatro caminos con un
   `xcrun` falso: vacío, fallo con mensaje, ruta inexistente y ruta buena.
2. **Paso 5e · sus prerrequisitos, nombrados.** **No necesita la API levantada**:
   `recorrido-web.mjs` levanta él mismo el guardarropa en `127.0.0.1:4599`. Lo
   que necesita es un **Chromium** que Playwright pueda lanzar y **el puerto
   libre**, y las dos cosas se comprueban ahora en el paso 1 —el puerto
   intentando escucharlo, no consultando una lista— con su remedio
   (`pnpm exec playwright install chromium`). Y ante un fallo, el 5e imprime
   comando, directorio, navegador y puerto, y clasifica: navegador ausente,
   puerto ocupado, compilación sin artefactos, o «esto es la APP».

---

### Tercera ronda de entorno · 2026-09-19 · los tres cierres

**1 · El paso 5e. La causa está en `fallo.png`, no en una hipótesis.**

La captura del fallo muestra el formulario de acceso con **«Contraseña» rellena
y «Correo» vacío**, y debajo el validador de la propia app: «Escriba su correo».
Con eso, `_entrar()` sale en su primera línea —`if (!formulario.validate())
return;`— y **la petición del token nunca llega a emitirse**. El recorrido
esperaba 20 s `POST /supabase/auth/v1/token?grant_type=password`; lo que ocurrió
en su lugar no fue otra petición: **no hubo ninguna**.

`flutter_secure_storage` **no** interviene. El aviso
`flutter_secure_storage_web/src/subtle.dart · package:js/js.dart unsupported` es
de **compilación**, y la app ni siquiera llegó a tener sesión que guardar: se
quedó antes, en su propia validación de formulario. Era una pista razonable y
resulta ser un falso culpable.

La causa real es del recorrido: en Flutter web el campo es un `<canvas>` y el
texto entra por un `<input>` que el motor crea **al enfocar**. Si se teclea
antes de que exista, las pulsaciones se pierden — y eso explica la asimetría
exacta de la captura: el segundo campo funciona porque para entonces el motor ya
está listo. La versión anterior sustituyó `fill()` por clic + tecleo, lo que
**redujo la ventana sin cerrarla**.

Arreglo, ocho líneas: `escribirEn()` escribe y **lee el valor de vuelta**; si no
entró, limpia y reintenta hasta tres veces, y si sigue vacío **lo dice** en vez
de esperar una petición que ya nadie va a hacer. Ejercido en los dos sentidos:
el recorrido completo pasa, y forzando el fallo aparece «el campo «Correo» sigue
vacío tras 3 intentos … Es el recorrido, no la app».

> **No hace falta declararlo no ejercido en web.** El recorrido no estaba
> midiendo algo imposible en esa plataforma: estaba perdiendo pulsaciones. Si el
> síntoma vuelve, ahora el mensaje lo separa de la app en la primera línea.

**2 · El paso 9, y por qué el control de hace dos rondas ya fallaba.**

En una línea: **la comprobación que escribí daba por hecho `node_modules`, y el
banco de las pruebas negativas es un clon sin ellos** — así que en cualquier
máquina sin el Chromium preinstalado del contenedor caía a `import('playwright')`
y exigía un paquete que allí, por construcción, no existe. De las dependencias
responde el paso 2 con `--frozen-lockfile`; confundir «falta el navegador» con
«falta instalar» fue el error. Reproducido haciendo invisible el Chromium del
contenedor —el control de antes falla, el de ahora pasa— y corregido sin tocar
la detección del navegador ausente, que sigue avisando.

**3 · El paso 7: el aviso era D-85 disfrazado, y D-86 queda cerrado.**

| ID       | Qué                                                                                                                                                                          | Estado                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **D-85** | Un paquete cuya corrida no terminaba dejaba su resumen ANTERIOR en disco: las capas se medían con un fichero viejo y el paso pasaba. Como aviso seguía siendo un falso verde | **Cerrado** · ahora es **fallo**, no aviso   |
| **D-86** | `@ncr/providers` al 84,58 % contra el 90 % que declara: `intercom-simulado.ts` con **147 líneas y cero pruebas**, y la lectura de entorno de la barrera sin sus ramas        | **Cerrado** · 98,49 % líneas · 90,47 % ramas |

D-86 se cierra con pruebas, no bajando el umbral: 11 casos para
`IntercomSimulado` —exclusividad del canal, relevo por caducidad, la renovación
al hablar, el cierre, el audio de 160 bytes— y 5 para
`crearControlDeBarreraDesdeEntorno`, más tres ramas de borde de los contratos
Hikvision. De 59 a 78 pruebas en el paquete.

> **Un hallazgo anotado y no corregido, a propósito.** `cerrarSesion()` del
> puerto no lleva `operadorId`, pero `IntercomSimulado` guarda un mapa de todos
> los operadores que pasaron por la instancia: si dos la comparten, un cierre
> los suelta a los dos y el canal queda libre en vez de relevar al que esperaba.
> Queda **escrito como prueba `[OBSERVADO]`**, no cambiado: una instancia por
> operador frente a una compartida es decisión de la consola (ETAPA 10) y del
> adaptador ISAPI (ETAPA 15), y resolverlo desde una ronda de verificación sería
> ampliar alcance.

---

### Cuarta ronda · 2026-09-19 · el 5e, la causa de verdad

El arreglo anterior **movió el fallo de campo en vez de eliminarlo**: antes
«Correo» vacío con «Contraseña» llena; después, «Correo» lleno y «Contraseña»
vacía. Un arreglo que desplaza el síntoma no ha tocado la causa.

**La causa: se estaba comprobando la cosa equivocada.** En Flutter web el
`<input>` del DOM no es el campo — es un buzón que el motor crea al enfocar y
del que copia el texto al widget. `inputValue()` dice que **el navegador**
recibió las pulsaciones, no que **la app** se haya enterado. Si el motor aún no
ha enganchado su escucha, las dos cosas divergen, y el reintento daba por bueno
un campo que para la app seguía vacío. Eso es exactamente el síntoma invertido:
la comprobación de vuelta pasaba, y el validador de la app decía que no.

La instrumentación —reintentos, valor leído en cada uno y con cuál se quedó— se
conserva en la salida del paso: por campo, una línea.

**El arreglo, en dos mitades, y ninguna es un reintento a ciegas:**

1. **La causa.** No se teclea hasta que el `<input>` de ese campo existe **y es
   `document.activeElement`**. Ese foco lo pone el motor, no el clic: es su
   señal de «ya estoy escuchando». Si no llega en 5 s, se dice.
2. **La verdad.** Se le pregunta a la app, no al DOM. Si al pulsar «Entrar» no
   sale la petición, se mira **cuál de sus dos validadores protesta** y se
   rellena ese campo. Hasta tres vueltas de 6 s.

**Ejercido en los dos sentidos**, saboteando la entrega al campo:

| Sabotaje                           | Resultado                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| La contraseña no llega **una vez** | «vuelta 1: no hubo petición; la app reclama la contraseña» → se rellena y el recorrido **completa**                                       |
| La contraseña no llega **nunca**   | Tres vueltas, y falla nombrando la causa: «es el recorrido tecleando en un campo que el motor no había enganchado, no un fallo de la app» |

Y tres ejecuciones seguidas del recorrido completo, las tres en verde.

| ID       | Qué                                                                                                                                              | Estado        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **D-87** | El recorrido leía el `<input>` del DOM creyendo leer el campo de la app. El reintento daba por bueno un campo vacío y el fallo cambiaba de sitio | **Corregido** |

> **No se declara no ejercido.** La opción estaba sobre la mesa y no hace falta:
> la causa tiene nombre, el arreglo la ataca donde está, y el caso que fallaba
> —exactamente el suyo— se reproduce a propósito y ahora se recupera solo. Lo
> que queda fuera de nuestro alcance es su máquina; por eso el recorrido, cuando
> no pueda, **lo dirá en la primera línea** en vez de esperar en silencio.

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
