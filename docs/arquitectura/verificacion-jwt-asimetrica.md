# Verificación de JWT con llaves asimétricas · diseño para la ETAPA 03

> **Documento de diseño, no de implementación.** Fija cómo la ETAPA 03 debe
> verificar tokens ahora que el proyecto usa **llaves de firma asimétricas con
> endpoint JWKS**, y no un secreto HS256 compartido.
>
> Verificado contra la documentación oficial de Supabase el **2026-09-06**.
> Fuentes al final.

- **Escrito en:** ETAPA 01 (corrección posterior al cierre)
- **Se implementa en:** ETAPA 03 · afecta a las ETAPAS 06, 11 y 12

---

## §1. Qué cambia y qué no

El proyecto de Grupo Control se creó con el esquema nuevo: **no tiene `anon` ni
`service_role` como llaves de API, ni secreto JWT compartido**. Conviene separar
tres cosas que suelen confundirse porque comparten nombre.

| Concepto                                          | Antes                                                                      | Ahora                                                  | ¿Cambia algo en lo construido?                       |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| **Llaves de API**                                 | `anon` y `service_role`, que eran JWT firmados con el secreto del proyecto | `sb_publishable_…` y `sb_secret_…`, que **no son JWT** | Solo los nombres de variable en `.env`               |
| **Roles de PostgreSQL**                           | `anon`, `authenticated`, `service_role`                                    | **Los mismos**                                         | **Nada.** Las llaves siguen resolviendo a esos roles |
| **Verificación de la firma del token de usuario** | HS256 con secreto compartido                                               | **Asimétrica** (RS256/ES256) contra JWKS               | Todo el diseño de la ETAPA 03                        |

### 1.1 Lo que **no** hay que tocar

**Las 16 migraciones de la ETAPA 01 no cambian ni una línea.** Es la
consecuencia más importante de esta revisión, y merece explicarse:

- Las llaves nuevas **resuelven a los mismos roles de PostgreSQL**. La
  publicable actúa como `anon`; la secreta actúa como `service_role`, que
  conserva el atributo `BYPASSRLS`.
- Nuestras políticas RLS no leen la llave: leen
  `current_setting('request.jwt.claims')`, que PostgREST rellena **después** de
  verificar el token. El algoritmo de firma es indiferente para ese mecanismo.
- Los `GRANT` y `REVOKE` de la migración `0015` se declaran sobre los **roles**,
  no sobre las llaves. `REVOKE UPDATE, DELETE ON eventos` sigue siendo la
  barrera que la llave secreta **no** elude, exactamente igual que antes: es un
  permiso de tabla, y `BYPASSRLS` solo omite políticas de fila.

**La advertencia del riesgo número uno se mantiene palabra por palabra.** La
llave secreta omite RLS igual que lo hacía `service_role`. Cambia el nombre del
archivo `.env`, no el riesgo.

### 1.2 Lo que **sí** hay que rediseñar

La verificación del token en la API, y las consecuencias de una expiración de
**5 minutos** en la app Flutter, en la consola y en el canal de tiempo real.

---

## §2. Verificación asimétrica contra JWKS

### 2.1 El endpoint

```
https://<project-ref>.supabase.co/auth/v1/jwks
```

Responde también en `/auth/v1/.well-known/jwks.json`. Devuelve un objeto JWKS
con **solo las claves públicas** de las llaves de firma asimétricas. Si el
proyecto no usa llaves asimétricas, no devuelve ninguna.

### 2.2 Reglas de verificación — vinculantes

1. **Nunca confiar en el `alg` del encabezado del token.** El algoritmo se toma
   de la clave del JWKS seleccionada por `kid`, no de lo que declare el token.
   Aceptar el `alg` del token abre la confusión de algoritmos y el clásico
   `alg: none`.
2. **Nunca aceptar HS256.** No hay secreto compartido. Una biblioteca
   configurada con «cualquier algoritmo» convertiría cualquier clave pública
   conocida en un secreto de firma válido. La lista de algoritmos admitidos se
   declara de forma explícita y cerrada.
3. **Selección por `kid`.** El JWKS puede contener varias claves a la vez
   —así funciona la rotación sin caída—. Se elige la que coincide con el `kid`
   del encabezado.
4. **Validar además de la firma:** `exp`, `iss` (`https://<ref>.supabase.co/auth/v1`)
   y `aud` (`authenticated`). Tolerancia de reloj pequeña y explícita —60 s—,
   nunca abierta.
5. **Sin red en el camino caliente.** La verificación de cada petición usa la
   caché local. Descargar el JWKS por petición añadiría una llamada de red al
   presupuesto de 3 s de CU-01 y convertiría a Supabase en punto único de fallo
   de cada acceso.

### 2.3 Caché local y su TTL

| Parámetro                                                     | Valor                                               | Por qué                                                                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TTL de la caché local                                         | **600 s (10 min)**                                  | Es el mismo que el edge de Supabase cachea el JWKS. Ponerlo **más alto** significaría seguir aceptando tokens de una clave revocada más tiempo del que la propia plataforma lo hace |
| Refresco reactivo ante `kid` desconocido                      | Sí, **una vez**                                     | Es lo que permite adoptar una clave nueva antes de que venza el TTL                                                                                                                 |
| Suelo entre refrescos reactivos                               | **60 s**                                            | Sin él, un atacante fabrica tokens con `kid` inventado y provoca una descarga del JWKS **por petición**: amplificación de denegación de servicio contra el propio Auth              |
| Comportamiento al arrancar                                    | Descarga al inicio; si falla, `/ready` responde 503 | La API no puede autenticar sin JWKS. Debe declararse no lista, no arrancar fingiendo salud                                                                                          |
| Comportamiento si el refresco falla estando la caché caducada | **Rechazar**, no aceptar sin verificar              | Fallar cerrado (§2.1.4 del contrato)                                                                                                                                                |

### 2.4 Rotación de claves — y de dónde sale el margen de 20 minutos

Supabase maneja cuatro estados: **Activa**, **En espera** _(standby)_,
**Usada anteriormente** y **Revocada**. La rotación no exige desplegar de nuevo
ningún backend, porque todos leen el JWKS.

**La recomendación oficial es esperar al menos 20 minutos** al crear una clave
en espera o al revocar una usada anteriormente. Ese número no es arbitrario y
conviene entender la aritmética, porque determina nuestro TTL:

```
10 min  (caché del edge de Supabase)
+ 10 min (nuestra caché local, §2.3)
= 20 min  en el peor caso
```

Si nuestra caché local fuese de 30 minutos, el margen seguro pasaría a 40 y la
recomendación oficial dejaría de protegernos. **Ese es el motivo de fijar el TTL
local en 10 minutos y no más.**

**Procedimiento de rotación, sin caída:**

1. Crear la clave nueva en estado **en espera**. **Esperar 20 minutos.**
2. Promoverla a **activa**. Los tokens nuevos se firman con ella; los antiguos
   siguen validando contra la anterior, que pasa a _usada anteriormente_.
3. Esperar a que expiren los tokens en circulación — con 5 minutos de vigencia,
   basta con esperar **5 minutos más un margen**, no una hora.
4. **Esperar 20 minutos** desde el paso 2 y solo entonces **revocar** la
   anterior.

> Con la expiración de 5 minutos, el paso 3 pasó de ser el cuello de botella a
> ser trivial. La rotación completa la limitan ahora las cachés, no las sesiones.

---

## §3. La expiración de 5 minutos

Con firma asimétrica, la expiración del token de acceso pasa a ser de
**5 minutos**. Supabase desaconseja bajar de ahí.

> **Discrepancia detectada en la documentación, dejada por escrito.** La guía
> general de JWT sigue describiendo 3600 s como valor histórico por defecto,
> mientras el material de llaves de firma describe los 5 minutos del esquema
> nuevo. **El valor que manda es el que muestre el panel del proyecto**
> (Project Settings → Auth). Este diseño asume 5 minutos porque es lo que el
> cliente confirmó, y porque diseñar para el plazo corto es seguro si resulta
> ser más largo — al revés no.

### 3.1 Lo que **no** se ve afectado

- **El Edge Gateway.** Ingiere eventos con la **llave secreta**, que no es un
  JWT de usuario y no expira en 5 minutos. Su autonomía de 24 h (KPI-30) no
  depende de ningún token de sesión. **Sin cambios.**
- **Los trabajos de pg-boss.** Mismo caso.
- **Las decisiones de acceso.** El motor de reglas no consulta tokens: recibe
  contexto. CU-01 y su presupuesto de 3 s no se tocan.

### 3.2 App Flutter (ETAPA 11)

Es donde más duele, y no por el plazo en sí sino por la **suspensión**.

| Problema                                                   | Por qué aparece ahora                                                                                          | Qué debe hacer la ETAPA 11                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| El temporizador de refresco no corre con la app suspendida | Con 60 min había holgura para volver y refrescar; con 5 min, casi cualquier retorno encuentra el token vencido | **Refrescar al volver a primer plano**, antes de la primera petición, no de forma perezosa al recibir un 401 |
| Una petición sale con un token que caduca en vuelo         | La ventana es 12 veces más estrecha                                                                            | **Margen de refresco preventivo**: renovar si al token le quedan menos de 60 s                               |
| La cola sin conexión se vacía con un token vencido         | El modo sin conexión de HU-07 acumula operaciones                                                              | **Reautenticar antes de vaciar la cola**, no durante                                                         |
| Reintentos en tormenta tras recuperar red                  | Muchas peticiones a la vez, todas con token vencido                                                            | **Un solo refresco en vuelo**, compartido; las demás esperan a que resuelva                                  |

**KPI-10 (crear una autorización en menos de 60 s) no se ve afectado** si el
refresco al volver a primer plano se hace bien: el usuario no debe ver nunca una
pantalla de sesión expirada por haber dejado la app en segundo plano.

### 3.3 Consola web (ETAPAS 09 y 10)

Mismo patrón, más simple porque la pestaña no se suspende igual. Dos puntos
propios:

- **La consola de portería y la de guardia virtual se dejan abiertas turnos
  enteros.** Un fallo de refresco no puede traducirse en un operador que
  descubre la sesión caída justo cuando llega un visitante. El estado de sesión
  debe ser visible, y la reautenticación, no destructiva del contexto en curso.
- **El canal de tiempo real** (ETAPA 06) mantiene una conexión larga. Debe
  **reenviar el token renovado al socket** en cada refresco; si no, la conexión
  se cae a los 5 minutos y las consolas dejan de recibir eventos, que es
  precisamente lo que KPI-25 mide.

### 3.4 Rate limiting (§2.7.5)

Doce refrescos por hora y usuario donde antes había uno. El límite por identidad
de la ETAPA 03 debe **contemplar el refresco como tráfico normal**, no como
patrón abusivo. Un límite calibrado para el plazo de una hora convertiría en
`429` a los usuarios legítimos. Es un ajuste de configuración, no de diseño,
pero hay que hacerlo con la calibración a la vista.

---

## §4. Custom claims — verificado: no cambia nada

**El _Custom Access Token Hook_ funciona igual con llaves asimétricas.** El
gancho se ejecuta **antes** de firmar el token y modifica su carga útil; el
algoritmo de firma se aplica después. Son dos etapas independientes.

Y del lado de la base tampoco cambia nada:

- PostgREST verifica el token —ahora contra JWKS, de forma transparente para
  nosotros— y rellena `request.jwt.claims` con la carga útil.
- `auth.jwt()` de Supabase es exactamente
  `current_setting('request.jwt.claims', true)::jsonb`.
- Nuestro `app.claims()` lee esa misma variable. **Las 95 políticas RLS de la
  ETAPA 01 siguen siendo válidas sin tocar una línea.**

Los cinco claims del diseño —`usuario_id`, `persona_id`, `rol`,
`copropiedad_id` y el arreglo `copropiedades`— se emiten igual.

### 4.1 Una consecuencia nueva del plazo corto: el tamaño del token

El token viaja en **cada** petición y ahora se renueva doce veces más a menudo.
El claim `copropiedades` del operador de central es un arreglo, y un operador
con muchas copropiedades asignadas engorda todas las peticiones.

**Decisión para la ETAPA 03:** acotar el arreglo a las copropiedades del
**turno activo** del operador, no a todas las que tenga asignadas
históricamente. Si el número puede crecer sin techo, el claim deja de ser el
lugar adecuado y el alcance se resuelve con una consulta, a costa de una
función `SECURITY DEFINER` más —que habría que justificar por escrito, como se
hizo con `app.es_mi_vivienda`.

`[SUPUESTO]` **S-10:** un operador atiende un número acotado de copropiedades
por turno. Se revisa si aparece un caso real que lo desmienta.

---

## §5. Qué debe construir la ETAPA 03

- [ ] Verificador de JWT asimétrico: selección por `kid`, algoritmo tomado de la
      clave y **no** del token, lista cerrada de algoritmos, validación de
      `exp`, `iss` y `aud` con tolerancia de reloj explícita.
- [ ] Caché de JWKS con TTL de 600 s, refresco reactivo ante `kid` desconocido
      con suelo de 60 s, y **fallo cerrado** si la caché caducó y el refresco no
      responde.
- [ ] `/ready` en 503 mientras no haya JWKS utilizable.
- [ ] Prueba de que un token firmado con HS256 usando una clave pública del
      JWKS como secreto **es rechazado**. Es la prueba de regresión de la
      confusión de algoritmos.
- [ ] Prueba de rotación: token firmado con la clave anterior sigue validando
      mientras esté en el JWKS, y **deja de validar** tras la revocación y el
      vencimiento de la caché.
- [ ] Prueba de que un `kid` desconocido no dispara más de un refresco por
      minuto.
- [ ] Auth Hook de _custom claims_ con los cinco claims, y prueba de que
      `app.claims()` los recibe intactos.
- [ ] Rate limiting calibrado para un refresco cada 5 minutos por identidad.
- [ ] La suite de aislamiento de la ETAPA 03 recorre los **dos caminos**: token
      de usuario y **llave secreta**. Ese segundo camino sigue siendo el riesgo
      número uno, y el cambio de nombre de la llave no lo altera.

---

## §6. Fuentes

Consultadas el 2026-09-06.

- [JWT Signing Keys · Supabase Docs](https://supabase.com/docs/guides/auth/signing-keys) — endpoint JWKS, caché de 10 min en el edge, recomendación de 20 min al rotar, estados Activa / En espera / Usada anteriormente / Revocada.
- [API keys · Supabase Docs](https://supabase.com/docs/guides/api/api-keys) y [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) — formatos `sb_publishable_…` y `sb_secret_…`, sustitución de `anon` y `service_role`.
- [Upcoming changes to Supabase API Keys · Changelog](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys) y [Discussion #29260](https://github.com/orgs/supabase/discussions/29260) — retirada de llaves heredadas, proyectos nuevos sin `anon` ni `service_role` desde noviembre de 2025.
- [Introducing JWT Signing Keys · Supabase Blog](https://supabase.com/blog/jwt-signing-keys) — asimétrico por defecto en proyectos nuevos desde el 1 de octubre de 2025; expiración por defecto de 5 minutos.
- [Custom Access Token Hook · Supabase Docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) y [Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — el gancho modifica la carga útil antes de firmar; `auth.jwt()` en RLS.
- [JSON Web Token (JWT) · Supabase Docs](https://supabase.com/docs/guides/auth/jwts) y [User sessions](https://supabase.com/docs/guides/auth/sessions) — expiración y refresco; es la fuente que aún cita 3600 s como valor histórico.
