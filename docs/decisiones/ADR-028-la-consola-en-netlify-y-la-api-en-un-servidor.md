# ADR-028 · Netlify aloja SÓLO la consola; la API va en un servidor con procesos permanentes

|                 |                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-I (2026-09-26) · decisión del cliente **D8** · resuelve **P-08** en parte |
| **Sustituye a** | Nada. Precisa C-15 (plataforma de la API) y P-08                                              |
| **Afecta a**    | `docs/guias/DESPLIEGUE.md` §1, §6 y §13. **No se hizo trabajo de despliegue en esta etapa**   |

---

## Contexto

La API mantiene cuatro procesos que tienen que seguir en pie entre peticiones:

- las **escuchas de equipos**, rearmadas cada 30 s (`escuchas-de-equipos.ts`);
- el **canal de tiempo real** (SSE);
- el planificador de **pg-boss** (supresiones biométricas, barridos);
- el puente de video **go2rtc**, al que la API registra flujos y con el que
  negocia WHEP.

Ninguno cabe en funciones efímeras. P-08 llevaba abierta desde la ETAPA 00.

## Decisión

- **Consola web (Next.js) → Netlify.** Su renderizado en servidor, su proxy
  `/api/ncr/…` y el `middleware` de la CSP con nonce corren como funciones de
  Netlify.
- **API (NestJS) → un servidor con procesos permanentes**, con go2rtc a su
  lado. El proveedor concreto sigue abierto. Las cuatro secciones que faltan
  están enumeradas en `DESPLIEGUE.md` §13.
- Todo va en cuentas corporativas de Grupo Control.

## Consecuencias

- `API_URL` de la consola apunta al dominio público de la API. La app del
  residente compila la misma URL (`--dart-define=API_URL`).
- `CORS_ALLOWED_ORIGINS` de la API incluye el dominio de la consola en Netlify.
- **`[CONTRADICCIÓN]` C-37 · riesgo a decidir, no resuelto aquí (P-20).** El
  proxy de la consola (`apps/web/src/app/api/ncr/[...ruta]/route.ts`) hace
  pasar por el servidor de la consola el canal SSE (`…/eventos/flujo`) y el
  audio del intercomunicador. En Netlify ese servidor son funciones con tiempo
  máximo de ejecución, así que esos flujos largos se cortarían al llegar al
  límite. El canal SSE reconecta solo, con huecos. El audio de la guardia
  virtual se cortaría. **No afecta a la prueba en sitio (BE-02)**, porque allí
  la consola corre en el portátil (`pnpm --filter @ncr/web start`). Está
  registrado como `PENDIENTE DE DEFINICIÓN` P-20, con opciones y sin resolver.

## Verificación

Documental: `DESPLIEGUE.md` y `VALIDACION_HIKVISION_EN_SITIO.md` dicen lo mismo
que este ADR. Ninguna prueba despliega.

## Contingencia

Si P-20 se resuelve con conexión directa del navegador a la API para los flujos
largos, se hará en su propia etapa: es un cambio de autenticación (cookie
`httpOnly` hoy, token mañana) y de CORS, no de despliegue.
