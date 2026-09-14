# DT-12 · los recursos externos, cerrado

> DT-12 no es un defecto: es un **patrón**. «La prueba y el recorrido se solapan
> y dejan el hueco justo donde vive el defecto.» Se aplicó a los recursos que el
> sistema necesita y no controla, y esto es su cierre.

---

## 1 · Los cuatro recursos, y en qué estado quedan

| Recurso                 | Estado                               | Qué lo demuestra                                                                                                                                                                            |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JWKS**                | ✅ Cerrado                           | El arranque descarga el documento del proyecto real y **exige al menos una clave**: un `200 {"keys":[]}` ya no pasa por bueno (D-60, D-60b)                                                 |
| **PostgreSQL**          | ✅ Cerrado                           | `SELECT 1` real; `/ready` decide 503 sobre todas las dependencias (D-64)                                                                                                                    |
| **Bucket de evidencia** | ✅ Cerrado                           | Verificado **por ejercicio**: se sube un objeto real, se pide sin credencial —tiene que fallar— y con URL firmada —tiene que funcionar—. Encontró el bucket público en la primera ejecución |
| **SMTP**                | ⚠️ **Bloqueado por entorno (BE-01)** | Ver §3                                                                                                                                                                                      |

## 2 · Los dos que el cliente preguntó por su nombre

### 2.1 · FCM — **no es deuda: es orden de etapas, y ya tiene fecha**

El `NotificadorPush` cableado **anota en la bitácora y no envía**. No es un
adaptador a medias: es el adaptador correcto para hoy, y lo dice.

Enviar por FCM exige un registro de tokens del dispositivo del residente, y esa
tabla es de la **ETAPA 11** — la app del residente es quien la escribe. Montarla
ahora obligaría a inventar su forma y a que la 11 la deshiciera; el resultado
sería una migración de ida y vuelta, no una funcionalidad adelantada.

Lo que sí existe ya, y es la mitad que importa para la auditoría: **el intento
queda registrado**. El «Avisar al residente» de la guardia virtual (HU-28) deja
constancia de a qué vivienda se avisó, con qué texto y cuándo, aunque el aviso
no salga todavía del proceso.

**Cuando la ETAPA 11 lo construya, FCM pasa a ser el quinto recurso comprobado
al arrancar**, con el mismo criterio que los cuatro: hablar con el recurso real
al levantar y decir el remedio si no contesta.

### 2.2 · Realtime frente al SSE propio — **decidido, medido, y no es deuda**

**Supabase Realtime no se usa.** El canal en vivo es SSE servido por la propia
API (`text/event-stream`), detrás del mismo puerto que un adaptador de Realtime
cumpliría.

La razón no es preferencia técnica. El documento de requisitos señala Realtime
como riesgo de cronograma, y RN-18 exige escalar un evento crítico en **menos de
10 segundos**: ese plazo no puede depender de que un servicio externo esté a la
altura. Medido en cada corrida del verificador: **200 de 200 alertas entregadas,
p99 de decenas de milisegundos contra un umbral de 10 000**.

Lo que queda abierto no es la decisión, es su **cota**: el SSE propio no está
medido con cientos de operadores conectados a la vez. Ese ensayo es de la ETAPA
14, donde vive la observabilidad, y el puerto está listo por si algún día
conviene cambiar de adaptador.

## 3 · SMTP — lo único que sigue abierto, y por qué no es de código

No hay proveedor de correo. La comprobación de arranque verifica **la mitad que
es nuestra** —que la URL de redirección esté declarada y apunte a un origen que
la API admite— y **declara explícitamente la mitad que no puede ver**: el SMTP y
la plantilla viven en el panel de Supabase y no hay endpoint que los exponga.

Es la forma correcta de dejarlo —un verde que no miente— pero no está resuelto.
El **bloque 4** lo resuelve por el otro lado: con restablecimiento validado
contra la app de autenticación, el SMTP deja de ser requisito operativo y pasa a
ser una comodidad.

## 4 · Qué queda de DT-12 como patrón

El patrón sigue vivo aunque los recursos estén cerrados, y conviene decirlo: las
tres últimas apariciones **no fueron recursos externos**.

| Aparición | Dónde estaba el hueco                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| D-63      | jsdom no aplica CSP, y el recorrido visitaba el tablero sin datos                                  |
| D-67      | El recorrido sólo visitaba `127.0.0.1`, que es el origen exento de la subida de esquema            |
| D-68      | El banco de pruebas **fijaba `COOKIE_SEGURA: 'false'`**, es decir apagaba la condición del defecto |

La lección que queda escrita: **un banco que desactiva la condición del defecto
no prueba el sistema, prueba una variante suya que nadie despliega.**
