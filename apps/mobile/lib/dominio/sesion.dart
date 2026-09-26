/// La sesión, y la única política de esta app que merece ser función pura.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL DEFECTO QUE ESTO EXISTE PARA IMPEDIR
///
/// El token de Supabase de este proyecto **expira en 5 minutos**
/// (`docs/arquitectura/verificacion-jwt-asimetrica.md`). Una app móvil pasa
/// horas suspendida: el residente la abre, mira su vivienda, bloquea el
/// teléfono, y vuelve por la tarde. Si el refresco fuera perezoso —esperar el
/// 401 y entonces renovar— el regreso se vería así:
///
///   1. La pantalla se pinta con lo que había en memoria, que parece válido.
///   2. La primera petición sale con un token caducado hace horas.
///   3. Llega un 401. Ahora hay que renovar, reintentar, y decidir qué hacer
///      con las otras tres peticiones que salieron en paralelo y también
///      fallaron.
///   4. Si el refresco también falla —la ventana de refresco tiene su propio
///      plazo—, el residente ve «sesión expirada» **después** de que la app le
///      enseñara su casa. Y eso es lo que tumba la sesión tras la suspensión.
///
/// Aquí se hace al contrario: **al volver a primer plano se comprueba la
/// caducidad y se renueva ANTES de la primera petición**. Ninguna petición sale
/// con un token que ya se sabía vencido.
///
/// El 401 sigue manejándose —un token puede revocarse en el servidor mientras
/// la app está en primer plano—, pero como excepción y no como mecanismo.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ ES PURA, Y CON RELOJ INYECTADO
///
/// §2.4: nunca `DateTime.now()` dentro de la lógica. Una política de caducidad
/// que lee el reloj del sistema por su cuenta solo se puede probar esperando, y
/// nadie escribe una prueba que espera cinco minutos. Con el instante como
/// parámetro, los seis casos de borde se prueban en microsegundos.
library;

/// Sesión tal como la guarda el dispositivo. Sin JSON, sin `SharedPreferences`,
/// sin `flutter_secure_storage`: eso es infraestructura.
class Sesion {
  const Sesion({
    required this.tokenDeAcceso,
    required this.tokenDeRefresco,
    required this.expiraEn,
    required this.usuarioId,
    required this.copropiedadId,
    required this.correo,
    this.debeCambiarContrasena = false,
  });

  final String tokenDeAcceso;
  final String tokenDeRefresco;
  final DateTime expiraEn;
  final String usuarioId;

  /// La copropiedad sale de los claims del token, **no de una preferencia**:
  /// es la que la API va a exigir en la ruta, y si la app guardara otra el
  /// residente recibiría 404 sin entender por qué.
  final String? copropiedadId;
  final String correo;

  /// ADR-023 · el claim `debe_cambiar_contrasena` del token: una cuenta nueva o
  /// restablecida no puede hacer nada hasta cambiarla (lo impone el SERVIDOR;
  /// la app sólo lleva a la pantalla que toca en vez de mostrar 403).
  final bool debeCambiarContrasena;

  Sesion conTokens({
    required String tokenDeAcceso,
    required String tokenDeRefresco,
    required DateTime expiraEn,
    bool? debeCambiarContrasena,
  }) => Sesion(
    tokenDeAcceso: tokenDeAcceso,
    tokenDeRefresco: tokenDeRefresco,
    expiraEn: expiraEn,
    usuarioId: usuarioId,
    copropiedadId: copropiedadId,
    correo: correo,
    debeCambiarContrasena: debeCambiarContrasena ?? this.debeCambiarContrasena,
  );
}

/// Qué hacer con una sesión en un instante dado.
enum AccionDeSesion {
  /// Sirve como está.
  servir,

  /// Vence pronto o ya venció: renovar ANTES de usarla.
  renovar,

  /// No hay nada que renovar: pedir credenciales.
  pedirAcceso,
}

/// Margen por delante de la caducidad.
///
/// Un minuto sobre cinco de vida no es arbitrario: cubre el tiempo de vuelo de
/// la petición y el desfase de reloj del dispositivo, que en móviles reales
/// llega a decenas de segundos. Sin margen, un token «válido por 2 s» pasaría
/// la comprobación y llegaría caducado al servidor — el mismo 401 que esto
/// evita, solo más difícil de reproducir.
const margenDeRefresco = Duration(minutes: 1);

/// Vida máxima de un token de refresco sin usarse.
///
/// Supabase caduca el refresco tras un periodo de inactividad. Si la app
/// intentara renovar con uno muerto, el residente vería un error técnico en vez
/// de la pantalla de acceso. Comprobarlo aquí hace que la app pida credenciales
/// con una explicación, que es lo que un usuario puede resolver.
const vidaDelRefresco = Duration(days: 30);

/// **La política.** Pura, total, y con el instante como parámetro.
///
/// `ultimoUso` es cuándo se emitió o renovó por última vez la sesión: sirve
/// para juzgar el token de refresco, que no lleva su propia caducidad legible.
AccionDeSesion accionPara(
  Sesion? sesion,
  DateTime ahora, {
  DateTime? ultimoUso,
  Duration margen = margenDeRefresco,
}) {
  if (sesion == null) return AccionDeSesion.pedirAcceso;

  final emision = ultimoUso ?? sesion.expiraEn;
  if (ahora.difference(emision) > vidaDelRefresco) return AccionDeSesion.pedirAcceso;

  final limite = sesion.expiraEn.subtract(margen);
  return ahora.isBefore(limite) ? AccionDeSesion.servir : AccionDeSesion.renovar;
}

/// ¿Debe renovarse al volver a primer plano?
///
/// Es la pregunta que el observador del ciclo de vida hace, y se responde con
/// la misma política: un segundo camino de decisión sería un segundo
/// comportamiento, y el que no se prueba es el que falla.
bool debeRenovarAlVolver(Sesion? sesion, DateTime ahora, {DateTime? ultimoUso}) =>
    accionPara(sesion, ahora, ultimoUso: ultimoUso) == AccionDeSesion.renovar;
