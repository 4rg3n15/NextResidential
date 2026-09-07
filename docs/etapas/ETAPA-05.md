# ETAPA 05 — Autorizaciones y motor de reglas

Rama `etapa-05-autorizaciones-motor-reglas` · sacada de `develop` actualizado.

---

## 1 · Qué se construyó

El corazón del producto: la decisión de acceso, tomada por una función pura y auditable, funcionando de punta a punta **sin una sola línea de hardware**.

El motor recibe un contexto ya resuelto y un conjunto de políticas, y devuelve un `ResultadoAcceso` que sella la versión de reglas con la que decidió. Alrededor de él viven el agregado `Autorización` con sus objetos de valor (`Vigencia`, `PatrónRecurrencia`, `VersiónDeReglas`), los cuatro casos de uso que la crean y la modifican, la gestión de listas negras con el control de quién veta y quién levanta, un `MockProvider` que implementa los cuatro puertos de proveedor simulando un equipo que **se porta mal**, y el contrato de firma del Alarm Server, que cierra el endpoint de ingesta antes de que exista el hardware que lo usará.

Se cierra además el supuesto S-15 —varios titulares activos por vivienda— y se corrige un defecto de seguridad heredado de las etapas 03 y 04 que la etapa descubrió: el `ValidationPipe` **no estaba validando** los DTOs de dos controladores.

---

## 2 · Cómo se organizó y por qué

**El motor es una función, no un servicio.** `evaluarAcceso(contexto, reglas) => ResultadoAcceso`: sin estado, sin I/O, sin `new Date()`. El instante llega dentro del contexto y las reglas por parámetro. La consecuencia no es estética: es lo que permite que la ETAPA 12 ejecute **este mismo código** en el Edge y pueda demostrar que decidió igual que la nube. Un motor que consultara un repositorio no podría hacerlo, y RN-16 dejaría de ser verificable.

**Una política es `(contexto) => ResultadoAcceso | null`, y `null` significa «no me pronuncio».** Distinguir «no opino» de «permito» es lo que hace componible el conjunto: si una política que no aplica devolviera «permitido», bastaría una sola indiferente para abrir la puerta saltándose a las demás. Son lambdas y no clases porque no tienen estado que inyectar, y añadir una regla nueva no produce diff en el motor (OCP).

**La precedencia es un dato del dominio, no un detalle de implementación.** `REGLAS_PREDETERMINADAS` es una lista ordenada: `listaNegra` primero, y después vigencia, patrón y zona, con el orden del diagrama (pág. 3). El orden decide **qué motivo queda registrado**, y de eso depende que el informe diga la verdad: un visitante en lista negra con autorización vigente produce `LISTA_NEGRA` y no `VIGENCIA_EXPIRADA` (CA-13). Un permiso temprano **no corta** el recorrido; solo una negación lo hace.

**El contexto se carga entero antes de evaluar.** `CargadorDeContexto` es un puerto propio y no un método de un repositorio, porque cruza cuatro agregados —autorizaciones, lista negra, zona, consentimiento— y ninguno es su dueño. `DecidirAcceso` hace todo el I/O antes y ninguno después; es la frontera que mantiene puro al motor.

**`Vigencia` es cerrado-abierto `[desde, hasta)`.** Con un intervalo cerrado por los dos lados, dos vigencias consecutivas se solapan en el instante de corte y el mismo segundo pertenece a dos autorizaciones. Cerrado-abierto coincide además con el `tstzrange` `[)` de la migración 0006: dominio y base no pueden discrepar sobre si un acceso llegó a tiempo.

**La zona horaria vive dentro de `PatrónRecurrencia`.** «Los martes de 8:00 a 12:00» son las 8:00 **de la copropiedad**. Resolverlo con la hora local del proceso haría que la misma regla decidiera distinto en un servidor de Bogotá y en uno de Fráncfort. Un patrón que cruza la medianoche se rechaza y se expresa con dos: admitir el envolvente obligaría a cada consumidor a razonar el caso, y esa es la clase de detalle que se olvida en una rama.

**El `MockProvider` simula un equipo que falla.** Latencia, fallo transitorio con reintento, eventos duplicados y lecturas por debajo del umbral, todo gobernado por un generador **con semilla**: `Math.random()` haría irreproducible una prueba que falla una vez de cada veinte. El tiempo es virtual —`esperar` no bloquea, suma—, así que la latencia es un número que se afirma en una prueba en vez de un retraso real. Es una sola clase para los cuatro puertos porque simula **un equipo**, y su estado —qué canal de audio está ocupado— es el mismo estado.

**KPI-11 se comprueba, no se recuerda.** `scripts/lib/frontera-hardware.mjs` recorre el código y falla si aparece el protocolo del fabricante o una IP de equipo fuera de `packages/providers`. Está en el verificador de etapa, en `verificar-frontera.sh` y en CI, y tiene su propia prueba negativa. La primera ejecución encontró un incumplimiento real: el comentario del puerto `IntercomProvider` nombraba el protocolo que ese puerto existe para ocultar.

**La firma del Alarm Server se diseña ahora, no después.** El endpoint de ingesta no tiene sesión de usuario: el emisor es una cámara. Lo único que lo acredita es un HMAC sobre `<marca>.<cuerpo crudo>`, comparado en tiempo constante y con ventana de frescura. Sobre el cuerpo **crudo** porque reserializar el JSON produce otra cadena; en tiempo constante porque un `===` filtra cuántos bytes acertó quien lo intenta; con ventana porque, sin ella, un POST capturado sirve para siempre. Y los eventos entran en una tabla inmutable: un evento falso admitido ya no se puede quitar.

---

## 3 · Árbol de archivos

```
packages/domain-core/src/
├─ autorizaciones/
│  ├─ vigencia.ts                    Intervalo [desde, hasta) alineado con el tstzrange de la base
│  ├─ patron-recurrencia.ts          Días, franja y desplazamiento horario DENTRO del objeto de valor
│  ├─ version-de-reglas.ts           Sello de auditoría de toda decisión (RN-16)
│  ├─ autorizacion.ts                Agregado raíz: revocar, acompañantes, zonas, patrón
│  └─ *.test.ts                      (4 ficheros) bordes de vigencia, patrón y RN-05
├─ reglas/
│  ├─ resultado-acceso.ts            Unión discriminada: una negación sin motivo no compila
│  ├─ contexto.ts                    Todo resuelto de antemano; `ahora` inyectado
│  ├─ politicas.ts                   8 políticas + combinadores (`primeraQueNiega`, `permitirSi`)
│  ├─ motor.ts                       `evaluarAcceso` y el orden vinculante de precedencia
│  └─ motor.test.ts                  35 pruebas: 100 % de ramas de la carpeta
packages/providers/
├─ src/mock/simulacion.ts            Azar con semilla, perfiles, reloj virtual, fallo simulado
├─ src/mock/mock-provider.ts         Los CUATRO puertos de proveedor en una clase
├─ src/mock/mock-provider.test.ts    24 pruebas: duplicados, baja confianza, exclusividad de audio
└─ vitest.config.ts                  Alias al CÓDIGO FUENTE de domain-core, nunca a su dist
apps/api/src/autorizaciones/
├─ aplicacion/puertos.ts             Repositorios, lista negra, versión de reglas, cargador
├─ aplicacion/casos-de-uso.ts        Crear (simple y recurrente), acompañante, revocar
├─ aplicacion/listas-negras.ts       RN-07: quién veta ≠ quién levanta
├─ aplicacion/evaluar-acceso.ts      Todo el I/O antes de invocar al motor
├─ presentacion/firma-ingesta.ts     Contrato de firma del Alarm Server (RNF-03.11)
├─ presentacion/guardia-firma.ts     Guard + captura del cuerpo crudo en express.json
├─ presentacion/ingesta.controller.ts POST /ingesta/eventos, público pero firmado
├─ presentacion/dtos.ts              Forma; la verdad la valida el agregado
└─ autorizaciones.module.ts
apps/api/test/
├─ ingesta.e2e.test.ts               6 pruebas: sin firma, firma falsa, firma vieja, válida
└─ validacion-dtos.e2e.test.ts       Guardia de regresión del defecto del ValidationPipe
scripts/lib/frontera-hardware.mjs    KPI-11 por ejecución, con exención explícita y auditable
```

Modificados: `eslint.config.mjs` (dos correcciones, §8), `main.ts` y `test/utilidades.ts` (cuerpo crudo), `configuracion/esquema.ts` y `.env.example` (secreto de firma), `metricas.mjs` (mide `@ncr/providers`), `pruebas-negativas.mjs` (quinto control), `verificar-etapa.sh` y `verificar-frontera.sh` (KPI-11), `verificacion.yml` (KPI-11 en CI), `vivienda.ts` (S-15).

---

## 4 · Tabla SOLID

| Principio | Materialización en esta etapa                                                                                                                              | Verificación                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **SRP**   | Cada política decide **un** criterio; `politicaZona` produce tres motivos distintos porque el documento separa tres criterios. Ningún fichero > 300 líneas | `motor.ts` 84 líneas · `politicas.ts` 150 · ninguna clase con > 5 métodos públicos  |
| **OCP**   | Añadir una regla es añadir una lambda a una lista ordenada                                                                                                 | `REGLAS_PREDETERMINADAS` es un array; `evaluarAcceso` no cambia                     |
| **LSP**   | `MockProvider` satisface los cuatro puertos con la misma instancia y las mismas firmas que tendrá `HikvisionProvider`                                      | Prueba explícita de asignación a los cuatro tipos (KPI-12)                          |
| **ISP**   | Se añadieron puertos pequeños y separados (`CargadorDeContexto` aparte de los repositorios) en vez de un `ServicioDeAccesos`                               | Ningún adaptador lanza `NotImplemented`                                             |
| **DIP**   | La aplicación define los puertos; el dominio no conoce ni a Nest ni a Postgres                                                                             | `grep -r "supabase\|axios\|isapi" **/domain-core/src/` → 0; verificado por mutación |

---

## 5 · Trazabilidad

**Cubierto.** CU-01 (flujo principal y los alternos de baja confianza, lista negra y fuera de patrón, contra `MockProvider`) · HU-07, HU-08, HU-09, HU-10, HU-35 · RN-01, RN-05, RN-06, RN-07, RN-13 (parte), RN-14, RN-15, RN-19, RN-22 · CA-04, CA-05, CA-06, CA-07, CA-12, CA-13 · KPI-11 (verificado por ejecución y por mutación), KPI-12 (la suite completa corre sin hardware).

**Parcialmente cubierto, con motivo.** CA-14 y CA-15 tienen su motivo tipado y su rama en el motor, pero el agregado `Zona` con su `Aforo` es de la ETAPA 07: aquí la zona entra al contexto ya resuelta. RN-09 y RN-10 tienen política y motivo; el agregado `Consentimiento` es de la ETAPA 08. RN-17 y CA-22: la clave de idempotencia se construye y se devuelve, pero el registro duradero es de la ETAPA 06. KPI-06 a KPI-10 son de extremo a extremo con la app móvil (ETAPA 11). CP-02, CP-03 y CP-04 quedan cubiertos en su parte de decisión; su parte de evento y evidencia es de la ETAPA 06.

**No cubierto y declarado.** La persistencia de autorizaciones y listas negras: los casos de uso están escritos contra sus puertos y probados con dobles, y el adaptador PostgreSQL llega con la ETAPA 06, que trae la unidad de trabajo transaccional real. Se prefirió esto a un adaptador a medias que diera la impresión de una garantía que hoy no existe.

---

## 6 · Pruebas

**206 pruebas en 25 ficheros**, todas verdes: 90 en el dominio, 24 en los proveedores, 92 en la API.

- **Motor de reglas: 100 % de ramas** —de ramas, no de líneas— en `packages/domain-core/src/reglas/`. Cada uno de los diez motivos de denegación tiene su prueba propia, y una prueba adicional comprueba que los diez son **distintos entre sí**, no que existan.
- **CA-13 con dos pruebas**: lista negra con autorización vigente (se afirma primero que la autorización **está** vigente, para que la prueba no pase por accidente) y lista negra con vigencia ya expirada.
- Bordes: el minuto exacto de `hasta`, el minuto exacto de `minutoFin`, dos vigencias consecutivas en el instante de corte, y el día de la semana calculado sobre la hora local de la copropiedad.
- `MockProvider`: duplicación de eventos, lectura de baja confianza, latencia acumulada de **todos** los intentos, exclusividad del canal de audio con cola, y determinismo del generador con semilla.
- Ingesta: sin firma → 401, firma inventada → 401, firma vieja → 401, firma válida → 202 con la clave de idempotencia, cuerpo mal formado → 400.

Ejecución: `pnpm test` para la suite; `./scripts/verificar-etapa.sh` para el cierre.

**Veredicto literal de §2.8.0:**

```
▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/domain-core:test:       Tests  90 passed (90)
   @ncr/api:test:       Tests  92 passed (92)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 25 de 25 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 99.29 % · ramas 100.00 % · funciones 97.37 % (umbral 90 %, 14 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 98.38 % · ramas 94.94 % · funciones 100.00 % (umbral 90 %, 7 archivos)
     OK   global: lineas 81.45 % · ramas 95.32 % · funciones 86.92 % (umbral 70 %, 59 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 15 superficies con shell sin construcciones divergentes BSD/GNU

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 5 controles detectan su violación, sin tocar el árbol

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ sin secretos
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

---

## 7 · Verificación de seguridad (contra §2.7)

1. **Secretos solo en entorno.** `INGESTA_FIRMA_SECRETO` se añade al esquema Zod con mínimo de 32 caracteres: sin él **la aplicación no arranca**. Se versiona en `.env.example` con su descripción y sin valor. Escaneo de secretos verde.
2. **CORS.** Sin cambios; la ingesta no es una ruta de navegador.
3. **Validación en el backend.** Se encontró y corrigió un incumplimiento real (§8, D-24). Todos los DTOs nuevos están validados y hay una prueba de regresión que lo comprueba **por ejecución**.
4. **Anti inyección.** Sin SQL nuevo en esta etapa.
5. **Rate limiting.** La ingesta hereda el `ThrottlerModule` global. Un límite endurecido por dispositivo se registra como pendiente de la ETAPA 06, cuando exista el registro de dispositivos.
6. **RLS.** Sin tablas nuevas. Los casos de uso comprueban la copropiedad **en la capa de aplicación**, como exige §2.7.6 para toda ruta que pueda usar la llave secreta.
7. **CSP.** Sin cambios.
8. **Transversales.** La firma se compara en tiempo constante; el motivo del rechazo se registra pero **no se devuelve al cliente**; la ventana de frescura acota la repetición.

---

## 8 · Deuda técnica, supuestos y pendientes

**Defecto corregido — D-24 · el `ValidationPipe` no validaba.** `import type { RegistrarVehiculoDto }` borra la clase al compilar, así que `design:paramtypes` queda en `Object` y el pipe **desiste en silencio**: devuelve el cuerpo sin validar, sin error y con la suite en verde. Comprobado: un POST a `/auth/mfa/verificacion` con `codigo: 12345` (número donde se exige cadena) y un campo no declarado **llegaba al manejador**. Afectaba a los controladores de padrón y de autenticación desde las ETAPAS 03 y 04. Corregido pasando a importación por valor, con `consistent-type-imports` desactivada en los controladores —la regla empujaba justo hacia la forma rota— y con `validacion-dtos.e2e.test.ts` como guardia, verificada por mutación: al reponer `import type`, la prueba se pone roja. Es el tercer caso de la misma familia (metadata de decoradores en la 03, `dist` viejo en la 04): **un detalle del compilado que hace inerte un control sin ponerlo en rojo.**

**Corrección de una regla de linter.** `NewExpression[callee.name='Date']` prohibía también `new Date(otra.getTime())`, que es una copia determinista y no una lectura del reloj; el dominio la necesita para que un objeto de valor no comparta referencia con quien se la pasó. Acotada a `arguments.length=0`. La sonda de `verificar-frontera.sh` sigue rechazando `new Date()`.

**S-15 cerrado** (varios titulares activos por vivienda, resuelto por el cliente el 2026-09-07): se retira la invariante de titular único y se añade `titularesActivos`. El singular de CU-01 se refiere a a quién se contacta, no al modelo.

**Deuda nueva.**

| ID   | Deuda                                                                                                        | Se salda en |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| D-24 | (arriba) Cerrada en esta etapa; queda el aprendizaje registrado                                              | —           |
| D-25 | Autorizaciones y listas negras no tienen adaptador PostgreSQL: los casos de uso corren contra dobles         | ETAPA 06    |
| D-26 | La exención `kpi-11-exento` es un mecanismo con dos usos hoy, ambos en el propio verificador. Debe auditarse | ETAPA 13    |
| D-27 | La ingesta acepta el evento y devuelve su clave de idempotencia, pero **no lo persiste ni decide** todavía   | ETAPA 06    |
| D-28 | Rate limiting por dispositivo en la ingesta, además del global                                               | ETAPA 06    |

**`PENDIENTE DE DEFINICIÓN`.** P-02 (umbral de confianza) sigue abierta; el motor lo toma del contexto y el supuesto vigente es 0,85. Entre la mitad del umbral y el umbral, la lectura **no se niega**: se permite marcada para confirmación humana (CU-01, 3a). P-09 (compuerta de aprobación administrativa) sigue abierta y **no se construye**.

---

## 9 · Qué debe hacer el usuario manualmente

1. Añadir a `apps/api/.env` la variable **`INGESTA_FIRMA_SECRETO`** con un valor aleatorio de al menos 32 caracteres (por ejemplo `openssl rand -base64 48`). **Sin ella la API no arranca**, y eso es deliberado: un endpoint de ingesta sin firma aceptaría eventos de cualquiera.
2. Opcionalmente, `INGESTA_VENTANA_SEGUNDOS` (por defecto 300). Bajarla endurece la protección contra reenvíos, pero exige que el reloj de los equipos esté sincronizado; la guía de la ETAPA 15 lo incluye en su diagnóstico.
3. Ejecutar `./scripts/verificar-etapa.sh` en macOS y confirmar el veredicto, en particular los pasos 9 y 10, que son los dos que se corrigieron para esta etapa.
4. Guardar el secreto de firma donde se guarden los demás: se compartirá con el Alarm Server en la ETAPA 15.

---

## 10 · Rama y commits

Rama `etapa-05-autorizaciones-motor-reglas`, sacada de `develop` actualizado, con `origin/etapa-04-padron` fusionada para recuperar los dos commits de cierre que el squash del PR #8 dejó fuera de `develop`. Sin reescritura de historia.
