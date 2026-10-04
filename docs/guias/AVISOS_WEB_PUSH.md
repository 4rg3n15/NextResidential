# Avisos al residente por Web Push (sin Firebase)

**Para qué:** que el residente reciba en su teléfono el «Avisar al residente»
de la guardia y los avisos de su vivienda, con la consola cerrada.
**Quién:** TI de Grupo Control (llaves y despliegue) y el residente (activar).
**Decisión:** [ADR-036](../decisiones/ADR-036-avisos-por-web-push-sin-firebase.md).

---

## Lo incómodo primero

- **En iPhone sólo funciona con la consola instalada** en la pantalla de
  inicio y con **iOS 16.4 o posterior**. En Safari sin instalar, no hay avisos.
- **La app Flutter no recibe avisos con la app cerrada** (ADR-036): no lleva
  SDK de push. Los avisos al teléfono van a la **consola instalada**.
- **Rotar las llaves VAPID borra todas las suscripciones.** Cada residente
  tendrá que volver a pulsar «Activar avisos en este aparato» (§5).
- Chrome entrega por el servicio de push de Google, Safari por el de Apple.
  No hay cuenta de Firebase, pero el aviso **pasa** por esos servicios,
  cifrado: ellos no pueden leerlo.

---

## 1 · Generar el par VAPID (una vez)

En un equipo de TI, desde la raíz del repositorio:

```
node scripts/generar-llaves-vapid.mjs
```

Imprime tres líneas (`WEB_PUSH_VAPID_PUBLICA`, `WEB_PUSH_VAPID_PRIVADA`,
`WEB_PUSH_SUJETO`) y **no escribe nada en disco**. Cambie el sujeto por un
correo de Grupo Control que alguien lea (los servicios de push escriben ahí si
algo va mal).

## 2 · Dónde van las llaves

| Variable                        | Dónde                                                       | ¿Secreta? |
| ------------------------------- | ----------------------------------------------------------- | --------- |
| `WEB_PUSH_VAPID_PRIVADA`        | **Sólo** el entorno de la API (Secret Manager en Cloud Run) | **Sí**    |
| `WEB_PUSH_VAPID_PUBLICA`        | El entorno de la API (la consola la recibe de la API)       | No        |
| `WEB_PUSH_SUJETO`               | El entorno de la API                                        | No        |
| `WEB_PUSH_SERVICIOS_PERMITIDOS` | Opcional. Vacío = Chrome, Firefox, Safari y Edge            | No        |
| `WEB_PUSH_TTL_SEGUNDOS`         | Opcional. Vacío = 900 s                                     | No        |

En Cloud Run: Secret Manager → crear el secreto `web-push-vapid-privada` →
en el servicio de la API, «Variables y secretos» → exponerlo como
`WEB_PUSH_VAPID_PRIVADA`. **Nunca** en el repositorio, en Netlify ni en un
`NEXT_PUBLIC_*`.

## 3 · Comprobar que quedó activo

Al arrancar, la API escribe una de estas dos líneas:

- `avisos al residente por Web Push (VAPID)` → activo.
- `avisos al residente DESACTIVADOS: faltan las llaves VAPID` → no llega
  ningún aviso; la guardia lo verá («no le llega a la app del residente»).

Si falta una de las tres variables o la pública no corresponde a la privada,
la API **no arranca** y dice cuál.

## 4 · El residente activa los avisos

**Android (Chrome):**

1. Abra la consola en Chrome e inicie sesión.
2. Menú ⋮ → **Instalar aplicación** (o «Añadir a pantalla de inicio»).
3. Abra Next Control desde el ícono → **Notificaciones** → **Activar avisos en
   este aparato** → **Permitir**.

**iPhone (iOS 16.4 o posterior):**

1. Abra la consola en **Safari** e inicie sesión.
2. **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
3. Abra Next Control **desde ese ícono** (no desde Safari) e inicie sesión.
4. **Notificaciones** → **Activar avisos en este aparato** → **Permitir**.

Para quitarlos: el mismo botón dice **Quitar avisos de este aparato**. Si el
navegador los bloqueó, la pantalla lo dice: hay que permitirlos en la
configuración del sitio.

## 5 · Rotar el par VAPID

Hágalo sólo si la privada pudo quedar expuesta.

1. Genere un par nuevo (§1).
2. Sustituya **las tres** variables a la vez en el entorno de la API y
   despliegue. Con el par nuevo, todos los servicios de push rechazan las
   suscripciones viejas (403/410) y la API las **retira** solas al primer aviso.
3. Avise a los residentes: deben abrir **Notificaciones** y pulsar otra vez
   **Activar avisos en este aparato**.
4. Destruya la versión vieja del secreto en Secret Manager.

## 6 · Diagnóstico

| Síntoma                                             | Causa probable y qué hacer                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| La guardia lee «no le llega a la app del residente» | Ningún aparato suscrito en esa vivienda, o la API sin llaves (§3)                                            |
| En iPhone no aparece el botón                       | No está abierta desde el ícono de la pantalla de inicio, o iOS < 16.4                                        |
| «Los avisos están bloqueados…»                      | El residente negó el permiso: Ajustes del sitio → Notificaciones → Permitir                                  |
| Bitácora: `fallidos` > 0 con `suscritos` > 0        | El servicio de push no contestó o rechazó (no 404/410): revise la salida HTTPS de la API                     |
| 422 al suscribir                                    | El endpoint no es de un servicio de push admitido (`WEB_PUSH_SERVICIOS_PERMITIDOS`)                          |
| 409 al suscribir                                    | Ese navegador recibe los avisos de una cuenta de **otro** conjunto: cierre aquella sesión y quite sus avisos |
