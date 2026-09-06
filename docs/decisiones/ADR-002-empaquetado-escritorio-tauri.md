# ADR-002 · Empaquetado de escritorio con Tauri

- **Estado:** Aceptada
- **Fecha:** 2026-09-06 (formalización en la ETAPA 00)
- **Origen:** `CLAUDE.md` §4, ADR-02
- **Afecta a:** ETAPA 14

## Contexto

`CLAUDE.md` §2.6 exige que la consola web se entregue como **PWA instalable** y además **empaquetada para escritorio**. La base es la misma aplicación Next.js; lo que se decide es el contenedor nativo.

La consola de escritorio la usa personal de portería y de central de monitoreo, en equipos que operan accesos reales. Es una superficie con privilegio operativo, no un visor de informes.

## Decisión

**El empaquetado de escritorio se hace con Tauri.** Electron queda como alternativa documentada, **no implementada**.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **Electron** | Empaqueta un Chromium completo: binario de cientos de megabytes y una superficie de ataque considerablemente mayor. Sobre una máquina de portería que abre talanqueras, esa superficie no es un detalle |
| **Solo PWA, sin escritorio** | `CLAUDE.md` §2.6 y §7 exigen aplicación de escritorio empaquetada como entregable |
| **Aplicación nativa por plataforma** | Multiplicaría el esfuerzo sin aportar nada: la consola es web y funciona bien como web |

## Consecuencias

**Que se aceptan:**

- **Menor tamaño y menor superficie de ataque** que Electron, con la misma base Next.js.
- **Actualizaciones firmadas**, requisito de la ETAPA 14.
- **Política de red restringida al backend propio**: el contenedor no navega a orígenes arbitrarios.
- Ventana y menús propios.

**Que hay que asumir:**

- Tauri usa el **motor web del sistema operativo** (WebView2 en Windows, WKWebView en macOS, WebKitGTK en Linux). Hay que fijar y verificar versiones mínimas de sistema, y probar el renderizado en las tres plataformas objetivo, porque el motor no es idéntico entre ellas.
- La cadena de construcción exige Rust, que no está en el resto del monorepo. Se aísla en `apps/web` y se documenta en la guía de despliegue.

## Verificación

- La aplicación empaquetada arranca y opera las tres superficies (administración, portería, guardia virtual) en las plataformas objetivo.
- El actualizador verifica firma antes de aplicar.
- La política de red bloquea cualquier destino que no sea el backend propio.
- Se construye desde CI, no a mano (DoD de la ETAPA 14).
