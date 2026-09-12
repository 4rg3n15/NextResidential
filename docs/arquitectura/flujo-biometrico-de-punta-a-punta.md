# El flujo biométrico, de la captura a la supresión: qué está construido y qué falta

> Documento de aclaración pedido en el bloque 8 de la ETAPA 09-B.
> **Nada de lo que sigue es una estimación**: cada afirmación se contrasta con
> el fichero que la sostiene, y lo que falta se nombra con el trabajo concreto
> que queda, no con una etiqueta de «pendiente».

---

## 1. La pregunta, y la respuesta corta

> _La captura de la fotografía del visitante es de la app móvil (ETAPA 11), pero
> el almacenamiento y el ciclo biométrico ya están construidos en las etapas 06
> y 08. ¿Es así?_

**Sí, con una precisión que cambia la lectura:** las etapas 06 y 08 construyeron
el **dominio, los casos de uso, los puertos y los cerrojos de base de datos** del
ciclo biométrico. Lo que no construyeron —porque dependía de credenciales que no
existían entonces— son los **adaptadores** que conectan esos puertos con
Supabase. Crear el bucket cierra el primero de esos huecos por el lado de la
infraestructura; **no basta por sí solo**, y decir lo contrario sería exactamente
el tipo de verde que este proyecto persigue.

---

## 2. Qué hay construido, etapa por etapa

### ETAPA 06 · evidencia y trazabilidad

| Pieza                                                                              | Estado                                | Dónde vive                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Agregado `Acceso`, inmutable: sin setters, sin `update`, sin `delete`              | Construido                            | `packages/domain-core`                                     |
| Tabla `evidencias` con `bucket`, `ruta` y `hash_sha256` — **nunca una URL** (D-19) | Construida                            | migración `0011`                                           |
| Inmutabilidad por `REVOKE` + disparador + RLS, alcanzando al dueño                 | Construida y probada contra base real | ADR-05, migración `0017`                                   |
| Puerto `AlmacenEvidencia` (`guardar`, `urlFirmada`)                                | Construido                            | `packages/domain-core`                                     |
| Firma HMAC de vida corta, verificable en tiempo constante                          | Construida                            | `apps/api/src/eventos/infraestructura/evidencia-y-push.ts` |
| **Adaptador contra Supabase Storage**                                              | **NO construido**                     | —                                                          |

La firma no es simulada: es HMAC-SHA256 real sobre `clave.expiración`, con
comparación en tiempo constante y caducidad. Lo que es provisional es **dónde se
guardan los bytes**: hoy en un `Map` del proceso. Por eso el arranque avisa de
que la evidencia se pierde al reiniciar.

### ETAPA 08 · consentimiento y plantillas

| Pieza                                                                              | Estado                                                     | Dónde vive                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Agregados `ConsentimientoBiometrico` y `PlantillaBiometrica`                       | Construidos                                                | `packages/domain-core`                                     |
| Validación de calidad antes de generar plantilla (encuadre, nitidez, rostro único) | Construida                                                 | `apps/api/src/biometria/aplicacion`                        |
| **Sin consentimiento vigente no hay sincronización** (RN-09, CA-09)                | Construido y **garantizado por la base**, no por el código | migración `0022`                                           |
| Supresión inmediata al revocar y programada al vencer (RN-11, CA-10, CA-11)        | Construida sobre pg-boss                                   | `apps/api/src/biometria/aplicacion`                        |
| Bóveda AES-256-GCM, cifrado **en la aplicación** y no con `pgcrypto` (D-10)        | Construida                                                 | `apps/api/src/biometria/infraestructura/boveda-cifrada.ts` |
| Sin método público para descifrar: la plantilla no puede llegar al cliente         | Construido                                                 | mismo fichero                                              |
| **Repositorios contra PostgreSQL** de consentimientos y plantillas                 | **NO construidos** (D-39)                                  | —                                                          |
| **Empuje real a terminal facial**                                                  | ETAPA 15 · hoy `MockProvider`                              | —                                                          |

La garantía que más importa —que una plantilla no se pueda sincronizar sin
consentimiento— **no depende del código de la API**: es un `CHECK` y un
disparador de la migración `0022`, probados contra PostgreSQL real y verificados
por mutación. Esa parte está cerrada y no la afecta lo que falte arriba.

### ETAPA 11 · captura

La cámara del residente y la pantalla de consentimiento del visitante son de la
app Flutter. **No están construidas**, y no deben construirse antes: el contrato
las asigna a la 11.

---

## 3. Qué falta realmente para que el flujo funcione de punta a punta

Cinco piezas, en el orden en que conviene hacerlas. Sólo la primera se
desbloquea creando el bucket.

1. **Adaptador `AlmacenEvidenciaSupabase`.** Implementa el puerto que ya existe
   contra `POST /storage/v1/object/...` y `POST /storage/v1/object/sign/...`, y
   la fábrica de `eventos.module.ts` elige entre él y el de memoria según
   `EVIDENCIA_BUCKET`. Es un adaptador nuevo detrás de un puerto estable: no
   toca dominio ni aplicación. **El bucket del bloque 8 es su requisito previo,
   y por eso se crea ahora.**
2. **Repositorios PostgreSQL de `evidencias`, `consentimientos_biometricos` y
   `plantillas_biometricas`** (D-39, misma raíz que D-17 y D-25). La frontera ya
   es definitiva: cambia la fábrica y nada más. Sin ellos, un consentimiento
   aceptado no sobrevive a un reinicio, y los cerrojos de la migración `0022`
   —que sí existen— nunca llegan a ejercerse porque nadie escribe en esas tablas.
3. **Captura en la app Flutter (ETAPA 11)**: foto con validación de calidad
   **antes** del envío, y pantalla de consentimiento del visitante. Es la única
   pieza que el contrato sitúa fuera de este alcance.
4. **Validación del tipo REAL del fichero** en la subida, por contenido y no por
   extensión (§2.7.8). Los tipos MIME permitidos del bucket son la segunda
   barrera, nunca la única.
5. **Sincronización real con la terminal facial (ETAPA 15)**: alta, verificación
   del ciclo alta → reconocimiento → supresión, contra hardware. Hoy lo cubre
   `MockProvider`, que es lo correcto por ADR-03.

### Lo que el bucket sí resuelve hoy

Aunque el punto 1 esté por hacer, crear el bucket **ahora** y no cuando se
escriba el adaptador tiene dos efectos inmediatos:

- La comprobación de arranque deja de decir `SIN-CONFIGURAR` y pasa a ejercer el
  bucket de verdad en cada despliegue: existe, es privado, y un `GET` sin firmar
  no lo sirve.
- Se cierra el **primero de los cuatro recursos de DT-12**: el patrón de la
  deuda es «la prueba y el recorrido se solapan y dejan el hueco justo donde
  vive el defecto», y aquí el hueco era que nadie había hablado nunca con
  Storage.

---

## 4. La comprobación, ejercida y no declarada

`scripts/verificar-bucket-evidencia.mjs` **sube un objeto real** —un PNG de 1×1,
para que pase el filtro de tipos del bucket sin tener que relajarlo—, lo pide sin
credencial —tiene que fallar—, lo pide con URL firmada —tiene que funcionar— y lo
borra. Cada fallo imprime el cuerpo que devolvió Storage, porque un `400` a secas
obliga a adivinar. El procedimiento está en `docs/guias/CONEXION_SUPABASE.md` §7.2.

**Ya encontró algo real.** En la primera ejecución contra el proyecto de Grupo
Control el bucket había quedado marcado público —una casilla del panel— y el
guion lo cazó. Por inspección habría dado verde, y la evidencia de accesos, que
es prueba, estaba accesible a cualquiera con la ruta.

La razón de subir un objeto real, dicha sin rodeos: si se pide uno inexistente,
**un bucket público responde 404 igual que uno privado**. La sonda de arranque
hace eso —no puede hacer otra cosa sin escribir en el almacén de evidencia en
cada reinicio— y por eso su mensaje dice explícitamente qué no demuestra.

---

## 5. Resumen en una línea

El ciclo biométrico está construido donde se decide —dominio, casos de uso y
cerrojos de base de datos— y le faltan los adaptadores de persistencia y la
captura. El bucket es el primero de esos adaptadores por el lado de la
infraestructura, y verificarlo por ejercicio es lo que lo distingue de una
casilla marcada en un panel.
