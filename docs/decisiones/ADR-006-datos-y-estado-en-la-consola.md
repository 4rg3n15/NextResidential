# ADR-006 · Datos y estado en la consola: TanStack Query, y ninguna biblioteca de estado global

- **Estado:** Aceptada
- **Fecha:** 2026-09-09 (ETAPA 09-A)
- **Origen:** decisión de la ETAPA 09; `CLAUDE.md` §2.6 fija el stack de la consola pero no la capa de datos
- **Afecta a:** ETAPAS 09, 10 · KPI-14 · KPI-25 · KPI-35 · RN-15

## Contexto

`CLAUDE.md` §2.6 fija Next.js, TypeScript, Tailwind y shadcn/ui. No dice cómo la consola obtiene sus datos ni dónde guarda su estado, y son dos preguntas distintas que suelen responderse con la misma herramienta y no deberían.

La consola tiene, en realidad, **muy poco estado propio**. Casi todo lo que muestra es una copia de algo que vive en el servidor: indicadores, eventos, dispositivos, alertas. Lo único verdaderamente suyo son cosas efímeras —qué pestaña está abierta, si un diálogo está visible, en qué estado va el canal en vivo—.

Hay además tres restricciones que este dominio impone y que un valor por defecto genérico no contempla:

1. **El canal SSE es la fuente de frescura, no el sondeo.** La ETAPA 06 midió el canal —200 de 200 alertas con 25 consolas, p99 de 3 ms contra un umbral de 10 000 ms (KPI-25)— y `CLAUDE.md` §6 prohíbe explícitamente el sondeo. La capa de datos tiene que dejarse invalidar desde fuera.
2. **Un 4xx no mejora reintentando.** Un 401 exige volver a entrar. Y un 404 sobre un recurso de otra copropiedad reintentado tres veces produce **tres entradas en `auditoria_seguridad`** por un único intento, ensuciando el registro que sirve para detectar accesos cruzados (CA-24).
3. **La caché es por copropiedad.** El operador de central conmuta entre copropiedades (KPI-35). Una caché sin la copropiedad en la clave mezclaría resultados de dos tenants dentro del navegador: una fuga que ni la RLS ni la capa de aplicación pueden ver, porque ocurre después de que las dos hayan hecho su trabajo.

## Decisión

**Estado del servidor: TanStack Query v5.** **Estado propio de la interfaz: `useState` y un único contexto de React.** Ninguna biblioteca de estado global.

Configuración vinculante, en `apps/web/src/lib/api/proveedor.tsx`:

| Ajuste                     | Valor                      | Por qué este y no el de fábrica                                                             |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `retry`                    | ningún reintento ante 4xx  | Un 404 reintentado son tres registros de acceso cruzado por un solo intento                 |
| `staleTime`                | 15 s                       | El canal mantiene la frescura; la consulta es el respaldo. Un valor largo miente cuando cae |
| `refetchOnWindowFocus`     | activo                     | Un tablero veinte minutos en segundo plano no debe presentar cifras viejas como actuales    |
| Clave de consulta          | empieza por la copropiedad | KPI-35: conmutar de copropiedad no puede servir la caché de la anterior                     |
| Instancia de `QueryClient` | dentro de `useState`       | Una por módulo se compartiría entre peticiones en el servidor: fuga entre usuarios          |

## Alternativas consideradas

| Alternativa                                        | Por qué se descarta                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redux Toolkit + RTK Query**                      | Resuelve lo mismo arrastrando un almacén global que esta consola no necesita. El coste no es el tamaño: es que invita a copiar los datos del servidor al almacén, y entonces hay dos verdades |
| **Zustand / Jotai junto a un `fetch` propio**      | Habría que escribir a mano caché, reintentos, deduplicación e invalidación. Es exactamente el código que más se equivoca y que menos se prueba                                                |
| **Solo `useEffect` + `fetch`**                     | Sin deduplicación, cuatro componentes pidiendo el mismo indicador son cuatro peticiones. Y sin invalidación, el canal SSE no tendría cómo refrescar el resto de la pantalla                   |
| **SWR**                                            | Muy cercano y válido. Se elige TanStack Query por su invalidación por clave —que es la pieza sobre la que se apoya el canal— y por su control fino del reintento, que aquí no es cosmético    |
| **Solo componentes de servidor, sin capa cliente** | El tablero es una superficie en vivo. Con solo RSC, cada evento del canal exigiría una recarga de la ruta: más latencia y parpadeo en la pantalla que más se mira                             |

## Consecuencias

**Que se aceptan:**

- **Una consulta por bloque, no una agregada.** Es lo que hace cierto que «una tarjeta caída no tumbe el tablero» (`03-mockups.md` §2, estados ausentes de W-02), y por eso la API expone tres endpoints de tablero y no uno.
- El canal SSE **invalida**, no recalcula. Sumar uno al contador en el navegador reimplementaría en la interfaz una cuenta que ya vive en el dominio, y las dos se separarían en cuanto una autorización cambiara de estado.
- El estado del canal vive en el marco de la consola, no en cada página: si viviera en la página, el indicador desaparecería al navegar y parecería que la conexión se cae en cada cambio de pantalla.

**A asumir en etapas siguientes:**

- La ETAPA 10 añade la conmutación entre copropiedades del operador de central. La clave de consulta ya la contempla; lo que hay que **probar** es que al conmutar no queda ni una fila de la anterior (KPI-35).
- Si alguna vista futura necesitara estado compartido complejo, la salida es otro contexto acotado, no un almacén global: la razón de este ADR es evitar la segunda copia de la verdad, no la biblioteca concreta.

## Verificación

- `apps/web/src/lib/api/consultas.ts` — toda clave empieza por la copropiedad.
- `apps/web/src/lib/sse/canal.test.ts` — el canal entrega, reconecta y recupera; no sondea.
- La suite de aislamiento de la API (ETAPA 03) cubre el lado servidor; la parte de navegador se verifica en la ETAPA 10, con la conmutación ya construida.

## Contingencia

Si TanStack Query resultara inadecuado, el cambio queda acotado a `lib/api/`: las vistas consumen `useIndicadores`, `useAccesosPorHora`, `useDispositivos` y `useEventosRecientes`, no la biblioteca. Es el mismo patrón de puerto que el dominio usa con la infraestructura.
