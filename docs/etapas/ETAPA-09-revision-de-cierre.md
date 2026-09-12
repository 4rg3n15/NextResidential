# Bloque 9 · Revisión de cierre de la ETAPA 09

> **Documento de revisión. No se ha construido nada para escribirlo.**
> Todo lo que sigue está contrastado con el código; donde una cifra anterior era
> incorrecta, se corrige aquí y se dice cuál era.

---

## 1. Trazabilidad: qué cubre la ETAPA 09 y qué no

### 1.1 Cubierto, con su superficie construida

| Categoría | Cubiertos                                                                                    | Dónde                              |
| --------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| **HU**    | HU-01 a HU-05, HU-07 a HU-10, HU-16, HU-17, HU-18 a HU-20, HU-32, HU-35, HU-36, HU-37, HU-38 | Las nueve pantallas de 09-A y 09-B |
| **CA**    | CA-02, CA-03, CA-14, CA-15, CA-18, CA-23, CA-25, CA-26                                       | Ídem                               |
| **RN**    | RN-04, RN-12, RN-13, RN-15, RN-19, RN-20, RN-21, RN-22                                       | Ídem                               |
| **KPI**   | KPI-14 (pantallas mínimas), KPI-25 (canal en vivo, 200 de 200 alertas, p99 7 ms)             | Medidos en el verificador          |
| **CU**    | CU-05 en su parte de visualización                                                           | Zonas comunes                      |

**19 de las 38 HU** tienen superficie en la consola. La cifra no es un déficit:
las otras 19 son de la app del residente (ETAPA 11), de portería y guardia
virtual (ETAPA 10) y del Edge (ETAPA 12).

### 1.2 Parcialmente cubierto, con el motivo

| Elemento                                              | Qué falta                                                                                                   | Por qué                                                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KPI-35** · conmutación entre copropiedades sin fuga | La conmutación **existe** desde el bloque 1; lo que falta es medirla con dos copropiedades con datos reales | Se prueba en la ETAPA 10, que es donde el operador de central conmuta de verdad                                                                   |
| **HU-32** · «Residentes / Visitas» del informe (W-10) | El evento no registra si la persona era residente o visitante (**D-58**)                                    | El informe lo dice en vez de fingir el filtro. Requiere un campo nuevo en `eventos`, que es tabla append-only particionada: no es un cambio menor |
| **W-06** · reservas del día                           | No hay módulo de reservas (**P-15**)                                                                        | Fuera de alcance explícito del contrato                                                                                                           |
| **D-42** · menores y representante legal              | No existe en el esquema                                                                                     | Decisión pendiente de Grupo Control                                                                                                               |
| **Órdenes sobre equipos**                             | Se encolan y auditan; no se ejecutan                                                                        | ETAPA 15, por ADR-03                                                                                                                              |

### 1.3 Lo que no está ni pretende estarlo

CA-04 a CA-13, CA-16, CA-17, CA-19 a CA-22, CA-24 en su parte operativa, y los
KPI de latencia de hardware (13, 32, 33): son de las etapas 10, 11, 12 y 15.

---

## 2. Las cinco piezas del flujo biométrico

| #   | Pieza                                                                                                    | Peso              | Etapa que le corresponde                               | ¿Bloquea la ETAPA 10?                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| 1   | **`AlmacenEvidenciaSupabase`** · adaptador del puerto ya existente contra Storage                        | **1 jornada**     | **Ahora**, o al abrir la ETAPA 10                      | **SÍ. Ver §2.1**                                      |
| 2   | Repositorios PostgreSQL de `evidencias`, `consentimientos_biometricos` y `plantillas_biometricas` (D-39) | 2 jornadas        | ETAPA 10 (evidencias) · ETAPA 11 (las dos biométricas) | Parcialmente: sólo `evidencias`                       |
| 3   | Captura en la app Flutter, con validación de calidad antes del envío                                     | 3 jornadas        | **ETAPA 11**                                           | No                                                    |
| 4   | Validación del tipo REAL del fichero al subir, por contenido                                             | 0,5 jornadas      | Con la pieza 1                                         | No, pero es §2.7.8 y va en la misma sesión de trabajo |
| 5   | Sincronización real con terminal facial                                                                  | ETAPA 15 completa | **ETAPA 15**                                           | No (ADR-03)                                           |

### 2.1 Sí, una bloquea la ETAPA 10 — y tiene usted razón en preocuparse

**La consola de portería muestra la evidencia de cada evento (HU-21), y hoy el
`AlmacenEvidencia` cableado guarda los bytes en un `Map` del proceso.**

Consecuencias concretas si se entra a la ETAPA 10 sin la pieza 1:

- Al reiniciar la API, **toda la evidencia desaparece**. La fila de `eventos`
  sobrevive —es append-only— y apunta a un objeto que ya no existe: el portero ve
  un evento con una imagen rota.
- Con más de un proceso de API, la evidencia sólo la ve el proceso que la
  recibió. La consola de portería la pide al azar y falla la mitad de las veces.
- La consola de portería se construiría contra un adaptador que nunca va a ser el
  definitivo, y el modo de fallo —imagen que no carga— aparecería en la ETAPA 10
  pareciendo un defecto de la consola.

**Recomendación: construir la pieza 1 —y la 4, que va pegada— antes de abrir la
ETAPA 10.** Son 1,5 jornadas, es un adaptador detrás de un puerto estable, y no
toca dominio, aplicación ni interfaz. Es exactamente lo que ADR-03 dice que debe
costar cambiar de infraestructura.

Las piezas 2 (parte de `evidencias`), 3 y 5 no bloquean: la evidencia de un
evento LPR no necesita consentimiento biométrico, que es lo que las piezas
biométricas gobiernan.

---

## 3. DT-12 tras el bucket

DT-12 es el patrón —«la prueba y el recorrido se solapan y dejan el hueco justo
donde vive el defecto»— aplicado a los **cuatro recursos externos** que el
arranque comprueba.

| Recurso                               | Estado                      | Qué queda                                                                                  |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| **JWKS**                              | ✅ Cerrado                  | Se habla con el proyecto real al arrancar; la sonda exige al menos una clave (D-60, D-60b) |
| **PostgreSQL**                        | ✅ Cerrado                  | `SELECT 1` real; `/ready` decide 503 sobre todas las dependencias (D-64)                   |
| **Bucket de evidencia**               | ✅ **Cerrado hoy**          | Verificado por ejercicio, y la primera ejecución encontró el bucket público                |
| **Recuperación de contraseña (SMTP)** | ⚠️ **Abierto, y declarado** | Ver §3.1                                                                                   |

### 3.1 SMTP

La comprobación de arranque verifica **la mitad que es nuestra** —que la URL de
redirección esté declarada y apunte a un origen que la API admite— y **declara
explícitamente la mitad que no puede ver**: el SMTP y la plantilla viven en el
panel de Supabase y no hay endpoint que los exponga.

Es la forma correcta de dejarlo —un verde que no miente— pero **no está
resuelto**. El bloque 4 lo resuelve por el otro lado: si el restablecimiento se
hace con la app de autenticación, el SMTP deja de ser un requisito operativo y
pasa a ser opcional.

### 3.2 FCM

**No es un recurso de DT-12 y no está comprobado en el arranque**, porque no hay
nada que comprobar: el `NotificadorPush` cableado es `NotificadorPushRegistrado`,
que **anota el aviso en la bitácora y lleva la cuenta**. No envía.

Es deliberado y está dicho en el código: FCM llega con la ETAPA 11, que es la
dueña del registro de tokens del dispositivo del residente. Enviar hoy exigiría
inventar ese registro y la 11 tendría que deshacerlo.

**Cuando la ETAPA 11 lo construya, FCM se convierte en el quinto recurso de
arranque**, con el mismo criterio: hablar con el recurso real al levantar.

### 3.3 Realtime frente al SSE propio

**Supabase Realtime no se usa.** El canal en vivo es **SSE propio** servido por
la API (`text/event-stream`), detrás del mismo puerto que un adaptador de
Realtime cumpliría.

La razón está en el propio documento de requisitos, que señala Realtime como
riesgo, y en RN-18: el escalamiento de un evento crítico en menos de 10 segundos
**no puede depender de que un servicio externo esté a la altura**. Medido en el
verificador: 200 de 200 alertas, p99 de **7 ms** contra un umbral de 10 000.

**No queda nada pendiente aquí.** No es una deuda: es una decisión tomada, medida
y con el puerto listo por si algún día conviene cambiar.

---

## 4. Deudas vivas

### 4.1 Las seis variables que Zod no valida

`apps/api/.env.example` declara seis variables que el esquema **no valida**:
`PGBOSS_SCHEMA`, `DEVICE_VAULT_*` (dos), `LOG_LEVEL`, `SENTRY_DSN`,
`BIOMETRIC_KEY_REF`, `BIOMETRIC_ALGORITHM`.

**No es un fallo activo**: ninguna se lee, así que su ausencia no rompe nada. El
daño es otro y es real: `pnpm entorno:diff` se las exige al cliente, que dedica
tiempo a conseguir valores que no sirven para nada. Es el tipo de ruido que
enseña a ignorar una comprobación.

Tres de ellas tienen dueño claro: `SENTRY_DSN` y `LOG_LEVEL` son de la **ETAPA
14** (observabilidad); `DEVICE_VAULT_*` es de la **ETAPA 15** (credenciales de
dispositivo por copropiedad, RN-21).

**Propuesta: 0,25 jornadas.** Marcar cada una en el `.env.example` con la etapa
que la implementará, y que `comparar-entorno.mjs` las trate como **futuras**: no
las exige, y avisa si una futura se queda sin etapa declarada. Así no se borran
—perderíamos el contrato con las etapas que las declararon— ni se exigen.

### 4.2 Los módulos que abren su propio `Pool` — **corrección de cifra**

Dije «cinco módulos» y luego «seis». **Los dos números estaban mal.** Contado
sobre el código: **tres módulos** abren su propio `Pool` —`padron` (max 20),
`autorizaciones` (max 10) y `multiempresa` (max 5)— más **la sonda de arranque**,
que abre el suyo aparte. Cuatro `Pool` en total, 35 conexiones de tope.

La cifra importa porque cambia el tamaño del problema: es menor de lo que dije,
pero la forma del defecto es la misma y **empeora con cada módulo nuevo**.

Por qué hay que resolverlo **antes de la ETAPA 12**: el Edge reconcilia por lotes
al reconectar, y esa reconciliación se suma al tráfico normal. Con `Pool`
separados no hay un tope global — cada módulo tiene el suyo y ninguno sabe de los
otros — así que el límite real del proyecto Supabase se alcanza sin que ninguno
de los tres crea estar cerca del suyo.

**Propuesta: 0,75 jornadas.** Un `PoolModule` global que provea un único `Pool`
por proceso, con tope tomado de la configuración, inyectado por token; los tres
módulos lo consumen en vez de construirlo. La sonda de arranque **conserva el
suyo a propósito**: tiene que poder responder cuando el pool principal está
agotado, que es justo cuando `/ready` importa. Se registra como **D-66**.

### 4.3 Otras deudas vivas que conviene no perder de vista

| Id       | Asunto                                                  | Impacto en la ETAPA 10                                                |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| **D-39** | Repositorios de biometría en memoria                    | Bajo: la portería no usa biometría                                    |
| **D-25** | Autorizaciones y listas negras sin adaptador PostgreSQL | **Medio-alto.** La portería muestra las listas negras activas (HU-24) |
| **D-58** | El evento no distingue residente de visitante           | Bajo en la 10; afecta al informe                                      |
| **D-42** | Menores y representante legal                           | Ninguno                                                               |

**D-25 merece una decisión antes de la ETAPA 10**, por el mismo argumento que la
evidencia: una lista negra que se pierde al reiniciar es una lista negra que no
protege. Peso estimado: 1,5 jornadas.

---

## 5. Lectura honesta: ¿está la consola para pasar a la ETAPA 10?

**Sí, con dos condiciones que yo no me saltaría.**

### Lo que está sólido

- Las nueve pantallas, con los cinco estados **ejercidos** y no afirmados.
- El aislamiento multiempresa por los dos caminos, con barrido automático del
  enrutador que rompe el build ante cualquier fuga.
- El sistema de diseño con contraste AA **medido en los dos temas**, y una
  frontera que impide que un color se escape.
- El cliente generado desde OpenAPI, con el control que detecta un contrato
  desfasado.
- CSP con nonce sin `unsafe-inline`, verificado por un control que rompe el
  build ante un atributo `style`.
- 1.247 pruebas, 96 de 96 ficheros recogidos, tres corridas idénticas.

### Lo que arrastraríamos si pasamos hoy

1. **La evidencia en memoria del proceso.** Es su preocupación y es la correcta.
   La consola de portería es, junto con la de guardia virtual, la superficie que
   más depende de la evidencia. **1,5 jornadas** (piezas 1 y 4 del §2).
2. **Las autorizaciones y listas negras en memoria (D-25).** La portería muestra
   las listas negras activas y decide con ellas. **1,5 jornadas.**

### Lo que NO arrastraríamos y podría parecer que sí

- **KPI-35** no está medido, pero la conmutación está construida y probada; medirlo
  es trabajo **de** la ETAPA 10, no un requisito previo.
- **El bloque 4** (sesiones, restablecimiento, WebAuthn) no bloquea la ETAPA 10:
  es un agujero **operativo** —hoy hay que entrar al panel de Supabase— y no
  funcional. Se puede construir en paralelo o después.
- **FCM y SMTP** no los toca la portería.

### Mi recomendación en una frase

Construir las **3 jornadas** de persistencia real —evidencia y listas negras—
antes de abrir la ETAPA 10, y llevar el bloque 4 después o en paralelo. Es la
diferencia entre construir la portería sobre algo que funciona y construirla
sobre algo que se reinicia.
