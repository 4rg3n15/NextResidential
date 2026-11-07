# ADR-041 · La consola en Netlify, construida en GitHub y publicada a mano

|              |                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**   | Aceptada · 2026-11-07 · alcance **decisión del cliente D-160** («propuesta mínima» de la PR 2); el mecanismo de despliegue lo propone el agente                                                                         |
| **Precisa**  | [ADR-028](ADR-028-la-consola-en-netlify-y-la-api-en-un-servidor.md) (la consola va en Netlify) y [ADR-040](ADR-040-la-api-en-cloud-run-con-dos-modos.md) (la API, en Cloud Run). No los reescribe                       |
| **Afecta a** | `apps/web/netlify.toml` · `.github/workflows/desplegar-consola.yml` · `.github/workflows/verificacion.yml` (trabajo `consola-en-netlify`) · `scripts/lib/variables-de-netlify.mjs` · `docs/guias/DESPLIEGUE_NETLIFY.md` |

---

## Contexto

La consola ya sabía vivir en Netlify desde la ronda 15-R: el flujo en vivo y el
audio van directos a la API con billete, y la IP del navegador llega firmada.
Faltaba **cómo** se construye y se publica. Lo que pesa en la decisión:

- **El plan gratuito tiene 300 créditos al mes con tope duro**, y cada
  despliegue a producción cuesta 15. Al agotarlos, Netlify pausa **todos** los
  sitios de la cuenta.
- **Netlify no ofrece federación de identidad** con GitHub, como la que usa la
  API con Google: la credencial para publicar desde fuera es un token personal.
- Conectado a Git, Netlify construye **cada push** a la rama de producción, y
  cada PR con las variables del sitio. En el plan gratuito no se pueden acotar
  sus ámbitos.

## Decisión

1. **El sitio no se conecta a Git.** Lo publica un flujo de GitHub,
   `desplegar-consola.yml`, sólo a mano y en el environment «nube»: con
   aprobación, sólo desde `develop` o `main`, el mismo patrón que la API.
2. **Construye la CLI de Netlify**, en una versión fijada (`netlify-cli@27.14.2`),
   con `npx`. La documentación de Netlify pide fijarla en CI y recomienda
   meterla en el lockfile; no va en el lockfile para no añadir al árbol del
   monorepo cientos de paquetes que sólo usa el despliegue. **El adaptador
   OpenNext no se fija**, como recomienda Netlify.
3. **Las variables del sitio viven en Netlify.** El flujo comprueba sus
   NOMBRES, nunca imprime sus valores, y rechaza `NEXT_PUBLIC_*` y la llave
   secreta de Supabase. Tras publicar, comprueba la CSP real de la consola
   desplegada.
4. **El token se guarda como secreto del environment «nube»**, no del
   repositorio, con caducidad.
5. **En cada PR, la CI empaqueta la consola para Netlify** sin cuenta ni token
   (`netlify build --offline`). Comprueba que sale la función de Next con
   `nodejs22.x` y el middleware como función de borde con su emparejador.

## Consecuencias

- **Un séptimo secreto en Secret Manager**, `API_IP_FIRMA_SECRETO`: la primera
  versión fuera de la capa gratuita, USD 0,06 al mes.
- **El token de Netlify es el punto débil.** Es de una persona y alcanza todos
  sus sitios. Mitigado así:
  - sólo lo recibe un trabajo aprobado;
  - caduca;
  - se rota si esa persona deja el equipo.
    Con el plan Pro (D-158) puede pasar a un miembro con permisos acotados.
- **La lista blanca de porteros depende de `x-nf-client-connection-ip`**
  (S-160-01), que la documentación vigente de Netlify no describe. La PR 3 debe
  verificar que Netlify sustituye la que mande el navegador.
- **Las funciones corren en `nodejs22.x` de AWS**, no exactamente en el
  22.23.4 de `.nvmrc` (S-160-02).

## Alternativas descartadas

- **Despliegue continuo desde Git en Netlify.** No pide token en GitHub, pero
  publica sin aprobación, gasta 15 créditos por push y construye los PR con las
  variables del sitio.
- **La CLI de Netlify en el lockfile.** Es lo que recomienda Netlify. Aquí se
  prefirió fijar la versión con `npx`, a cambio de no tener el árbol de
  dependencias de la CLI bajo `--frozen-lockfile`.
