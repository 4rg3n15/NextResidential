# App del residente · `ncr_residente`

La app móvil Flutter de Next Control Residencial (ETAPA 11). Arquitectura
limpia en Dart —dominio, casos de uso, puertos, adaptadores— y **cliente de la
API generado** desde `packages/contracts/openapi.json`, nunca escrito a mano.
El informe completo está en [`docs/etapas/ETAPA-11.md`](../../docs/etapas/ETAPA-11.md).

## Configuración: todo por `--dart-define`, nada en el binario

La app se configura al compilar con tres valores, los tres públicos:
`API_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Los nombres y su
explicación están en [`.env.example`](.env.example); se pueden pasar de una
vez con `--dart-define-from-file`.

**Todo lo compilado en Flutter es extraíble del binario** (`strings` sobre el
`.apk` o el `.ipa` basta). Por eso la llave secreta de Supabase, la firma de
ingesta y la llave biométrica no entran nunca: el paso 5d del verificador
(`scripts/lib/flutter-sin-secretos.mjs`) falla si el código las nombra, y la
app se niega a arrancar si la llave recibida tiene forma de `sb_secret_…`.

`API_URL` **no tiene valor por omisión**. Sin ella la app arranca en una
pantalla que lo dice y enseña la línea que faltó, en vez de fallar con «sin
conexión»: en un teléfono físico `localhost` sería el propio teléfono.

## Arrancar contra la API que corre en su Mac

### Emulador Android

`10.0.2.2` es el alias del emulador para la máquina anfitriona:

```
flutter run -d emulator-5554 \
  --dart-define=API_URL=http://10.0.2.2:3000 \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
```

### iPhone físico, en Release y abierta desde el ícono

La guía completa, paso a paso, es
[`docs/guias/APP_EN_IPHONE.md`](../../docs/guias/APP_EN_IPHONE.md); la
decisión, [ADR-033](../../docs/decisiones/ADR-033-app-en-release-por-la-red-local.md).
En resumen:

```
flutter run --release -d <id-del-iPhone> \
  --dart-define=API_URL=http://<nombre-del-Mac>.local:3000 \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
```

`<id-del-iPhone>` sale de `flutter devices`; `<nombre-del-Mac>` de
`scutil --get LocalHostName`. Se instala una vez con cable; después se abre
desde el ícono sin el Mac conectado. Y tenga en cuenta:

- **El nombre `.local` no cambia de una red a otra**; la IP sí. Si la red
  bloquea mDNS, la opción **«Servidor»** de la pantalla de acceso —y «Cambiar
  servidor» en toda pantalla de error de conexión— deja escribir la IP del Mac
  sin recompilar. La app la prueba contra `/health` antes de aceptarla, la
  guarda en el llavero y, al cambiarla, cierra la sesión. `http://` sólo hacia
  IP privadas o `.local`; `https://` hacia cualquier destino.
- **El Mac y el iPhone deben estar en la misma red.** Desde datos móviles no
  hay ruta.
- **La API ya escucha en todas las interfaces**: `app.listen(PORT)` sin host en
  `apps/api/src/main.ts` enlaza `0.0.0.0` / `::`. Si no responde, mire el
  cortafuegos de macOS, que pide permiso para `node` la primera vez.
- **`CORS_ALLOWED_ORIGINS` de la API no aplica a la app nativa.** CORS es un
  mecanismo del navegador; la app no envía `Origin`.
- **Red local en iOS, igual en Debug, Release y Profile.** La app habla con la
  API por `dart:io`, que no pasa por App Transport Security; lo que sí la
  alcanza es el permiso de red local (`NSLocalNetworkUsageDescription`). La
  excepción `NSAllowsLocalNetworking` —nunca `NSAllowsArbitraryLoads`— va en
  las tres configuraciones para lo que use el sistema de URL de Apple.
  `scripts/lib/info-plist-ios.mjs` lo comprueba configuración por
  configuración.
- **Con un Apple ID gratuito la app caduca a los 7 días**; hay que
  reinstalarla con cable.

## Pruebas y verificación

```
flutter analyze lib test
flutter test
```

Desde la raíz del monorepo, `./scripts/verificar-etapa.sh` compila la app para
web, la recorre en un navegador real y ejecuta los controles de secretos y de
cliente al día. La cobertura por capa la mide `scripts/lib/cobertura-flutter.mjs`.
