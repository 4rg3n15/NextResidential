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

### iPhone físico

```
flutter run -d <id-del-iPhone> \
  --dart-define=API_URL=http://<IP-del-Mac>:3000 \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
```

`<id-del-iPhone>` sale de `flutter devices`; `<IP-del-Mac>` de
`ipconfig getifaddr en0`. Y tenga en cuenta:

- **El Mac y el iPhone deben estar en la misma red.** La API se alcanza por la
  IP privada del Mac; desde datos móviles no hay ruta.
- **La API ya escucha en todas las interfaces**: `app.listen(PORT)` sin host en
  `apps/api/src/main.ts` enlaza `0.0.0.0` / `::`. Si no responde, mire el
  cortafuegos de macOS, que pide permiso para `node` la primera vez.
- **`CORS_ALLOWED_ORIGINS` de la API no aplica a la app nativa.** CORS es un
  mecanismo del navegador; la app no envía `Origin` y la API acepta peticiones
  sin esa cabecera. Añadir ahí la IP del teléfono no hace nada.
- **HTTP por IP privada sólo funciona en depuración (iOS).** App Transport
  Security lo bloquea; la excepción `NSAllowsLocalNetworking` —nunca
  `NSAllowsArbitraryLoads`— sólo existe en la configuración Debug:
  `ios/Runner/Info.plist` se preprocesa y el bloque está bajo
  `#if NCR_DEPURACION`, que define `ios/Flutter/Debug.xcconfig` y no
  `Release.xcconfig`. Un binario de Release sólo habla HTTPS.

## Pruebas y verificación

```
flutter analyze lib test
flutter test
```

Desde la raíz del monorepo, `./scripts/verificar-etapa.sh` compila la app para
web, la recorre en un navegador real y ejecuta los controles de secretos y de
cliente al día. La cobertura por capa la mide `scripts/lib/cobertura-flutter.mjs`.
