# La app Android firmada, por descarga y sin tienda

**Para qué:** entregar la app del residente como un APK que se descarga e
instala, firmado con una llave **de Grupo Control**. **Quién:** TI de Grupo
Control. **Decisión:** P-23 (15-R) y [ADR-036](../decisiones/ADR-036-avisos-por-web-push-sin-firebase.md).

---

## Lo incómodo primero

- **La llave de firma es la identidad de la app para siempre.** Un APK firmado
  con otra llave **no** actualiza al anterior: Android lo rechaza y el residente
  tendría que desinstalar (y perder la sesión). Si la llave se pierde, no hay
  recuperación posible sin tienda. Guárdela como guarda las llaves de la
  infraestructura, con copia en un segundo lugar seguro.
- **Nunca en el repositorio, nunca en una cuenta personal** (§2.5 y la cláusula
  de titularidad de Grupo Control). Ni el `.jks`, ni sus contraseñas, ni el
  `key.properties`: `apps/mobile/android/.gitignore` ya excluye
  `key.properties`, `*.jks` y `*.keystore`; compruébelo antes del primer `git add`.
- **Instalar por descarga exige al residente permitir «orígenes
  desconocidos»** para su navegador. Es un paso que Android avisa como
  arriesgado; por eso el APK se publica sólo en un dominio de Grupo Control,
  por HTTPS, con su huella SHA-256 al lado.
- **La app no recibe avisos con la app cerrada** (ADR-036). Los avisos al
  teléfono van a la consola instalada; la app lee la bandeja al abrirse.

---

## 1 · Crear la llave (una vez, en un equipo de TI)

```
keytool -genkeypair -v \
  -keystore ncr-residente.jks -storetype JKS \
  -alias ncr-residente -keyalg RSA -keysize 4096 -validity 10000
```

Datos del certificado: organización **Grupo Control**. Guarde el `.jks` y las
dos contraseñas en el almacén de secretos de Grupo Control (p. ej. Secret
Manager) y en una copia fuera de línea. **No** lo deje en la carpeta del
repositorio.

## 2 · Decirle a Gradle dónde está, sin versionarlo

Cree `apps/mobile/android/key.properties` **sólo en el equipo que compila**
(está en `.gitignore`):

```
storeFile=/ruta/fuera/del/repositorio/ncr-residente.jks
storePassword=<del almacén de secretos>
keyAlias=ncr-residente
keyPassword=<del almacén de secretos>
```

En CI, el mismo fichero se escribe en tiempo de ejecución desde los secretos
del flujo y se borra al terminar; nunca se sube como artefacto.

## 3 · Compilar

```
cd apps/mobile
flutter build apk --release \
  --dart-define=API_URL=https://<api-de-produccion> \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Sólo valores **públicos** en `--dart-define`: todo lo compilado en Flutter es
extraíble del binario. La llave secreta de Supabase no va nunca.

## 4 · Verificar la firma antes de publicar

```
apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
sha256sum build/app/outputs/flutter-apk/app-release.apk
```

El certificado debe decir **Grupo Control**. Publique la huella SHA-256 junto
al enlace de descarga.

## 5 · Publicar y actualizar

1. Suba el APK al dominio de Grupo Control (HTTPS), con nombre que lleve la
   versión (`ncr-residente-1.4.0.apk`) y su huella.
2. El residente: abre el enlace en Chrome → descarga → **Instalar** (Android
   pedirá permitir instalar desde Chrome la primera vez).
3. Para actualizar, **misma llave y `versionCode` mayor**; si no, Android no
   instala encima.

## 6 · Si la llave se filtró

No hay revocación sin tienda. Genere una llave nueva, publique un APK nuevo con
otro `applicationId` sólo si es imprescindible, y pida a los residentes
desinstalar la anterior. Regístrelo como incidente y como aceptación de riesgo.
