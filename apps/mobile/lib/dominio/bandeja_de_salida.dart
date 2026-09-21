/// BANDEJA DE SALIDA del modo sin conexión (RN-17, CA-22).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// EL PROBLEMA, CONCRETO
///
/// El residente pulsa «crear visita» en el ascensor. La petición sale, el
/// servidor la procesa, y la respuesta se pierde porque el teléfono entró en el
/// sótano. La app no sabe si se creó. Si reintenta sin más, el portero ve dos
/// autorizaciones idénticas para la misma persona y no sabe cuál es la buena.
///
/// La salida es la de la ETAPA 12 para el Edge, y por las mismas razones: una
/// **clave de idempotencia generada antes del primer intento** y repetida en
/// cada reintento. El servidor, ante una clave que ya vio, devuelve lo de antes
/// en vez de crear otra cosa. La app deja de necesitar saber si el primer
/// intento llegó.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ ESTO ES DOMINIO Y NO UN `Timer`
///
/// Aquí no se envía nada ni se espera nada. Se decide: **qué toca enviar
/// ahora**, **cuándo toca el siguiente intento** y **cuándo hay que rendirse**.
/// Eso es una función del estado y del reloj, y por eso se prueba entera sin
/// red y sin esperar segundos reales. Quien tiene el `Timer` y el cliente HTTP
/// es la capa de aplicación.
///
/// El retroceso es exponencial **con tope y con jitter**, no porque quede bien:
/// sin tope, el cuarto reintento cae a los diez minutos y el residente cree que
/// se perdió; sin jitter, mil teléfonos que recuperan cobertura a la vez tras
/// una caída golpean la API en el mismo milisegundo — y el `@nestjs/throttler`
/// del servidor (§2.7.5) los rechaza a todos, que es justo lo contrario de
/// recuperarse.
library;

import 'dart:math';

/// Un envío pendiente. `cuerpo` es opaco a propósito: la bandeja no sabe qué
/// transporta, y por eso sirve igual para una visita, una revocación o el token
/// de notificaciones.
class EnvioPendiente {
  const EnvioPendiente({
    required this.claveDeIdempotencia,
    required this.recurso,
    required this.cuerpo,
    required this.encoladoEn,
    this.intentos = 0,
    this.proximoIntentoEn,
    this.ultimoError,
  });

  final String claveDeIdempotencia;

  /// Qué operación es. La bandeja no lo interpreta; lo usa quien la vacía.
  final String recurso;

  final Map<String, Object?> cuerpo;
  final DateTime encoladoEn;
  final int intentos;
  final DateTime? proximoIntentoEn;
  final String? ultimoError;

  EnvioPendiente copiaCon({
    int? intentos,
    DateTime? proximoIntentoEn,
    String? ultimoError,
  }) =>
      EnvioPendiente(
        claveDeIdempotencia: claveDeIdempotencia,
        recurso: recurso,
        cuerpo: cuerpo,
        encoladoEn: encoladoEn,
        intentos: intentos ?? this.intentos,
        proximoIntentoEn: proximoIntentoEn ?? this.proximoIntentoEn,
        ultimoError: ultimoError ?? this.ultimoError,
      );
}

/// Política de reintento. Con valores por omisión razonados, no redondos.
class PoliticaDeReintento {
  const PoliticaDeReintento({
    this.baseSegundos = 2,
    this.topeSegundos = 60,
    this.intentosMaximos = 8,
    this.jitter = 0.25,
  });

  /// Primer reintento a los 2 s: lo bastante pronto para que un bache de
  /// cobertura de un semáforo no se note.
  final int baseSegundos;

  /// Y nunca más de un minuto: por encima, el residente ya ha cerrado la app.
  final int topeSegundos;

  /// Ocho intentos son ~4 minutos con este tope. Más que eso no es un bache de
  /// cobertura: es que no hay red, y entonces lo que toca es decírselo.
  final int intentosMaximos;

  final double jitter;
}

/// Cuánto esperar antes del intento número `intento` (1 = el primer reintento).
///
/// `aleatorio` entra por parámetro para que la prueba lo fije. Un `Random()`
/// dentro haría que el jitter fuera imposible de probar, y entonces la parte
/// que protege al servidor sería justo la que nadie comprueba.
Duration esperaAntesDe(
  int intento, {
  PoliticaDeReintento politica = const PoliticaDeReintento(),
  double Function()? aleatorio,
}) {
  if (intento <= 0) return Duration.zero;
  final exponencial = politica.baseSegundos * pow(2, intento - 1);
  final acotado = min(exponencial.toDouble(), politica.topeSegundos.toDouble());
  // El jitter RESTA, nunca suma: sumar podría superar el tope y dejar al
  // residente esperando más de lo prometido.
  final sorteo = (aleatorio ?? Random().nextDouble)();
  final conJitter = acotado * (1 - politica.jitter * sorteo);
  return Duration(milliseconds: (conJitter * 1000).round());
}

/// La bandeja. Inmutable hacia fuera: cada operación devuelve la nueva lista.
class BandejaDeSalida {
  const BandejaDeSalida(this.pendientes);

  final List<EnvioPendiente> pendientes;

  /// Encola, o **no hace nada** si esa clave ya está dentro.
  ///
  /// Es la primera mitad de la idempotencia y vive aquí, en el cliente: sin
  /// ella, dos pulsaciones seguidas del botón «crear» meten dos envíos con la
  /// misma clave y el segundo recibiría del servidor la respuesta del primero
  /// — correcto, pero habiendo gastado una ida y vuelta para averiguarlo.
  BandejaDeSalida encolar(EnvioPendiente envio) {
    if (pendientes.any((p) => p.claveDeIdempotencia == envio.claveDeIdempotencia)) {
      return this;
    }
    return BandejaDeSalida([...pendientes, envio]);
  }

  /// Lo que toca intentar AHORA: lo que nunca se intentó y lo que ya cumplió su
  /// espera. En orden de encolado, que es el orden en que el residente los
  /// creó — reordenarlos haría que las visitas aparecieran al portero en un
  /// orden distinto del que la persona recuerda.
  List<EnvioPendiente> listosEn(DateTime ahora) => pendientes
      .where((p) => p.proximoIntentoEn == null || !p.proximoIntentoEn!.isAfter(ahora))
      .toList();

  BandejaDeSalida quitar(String clave) =>
      BandejaDeSalida(pendientes.where((p) => p.claveDeIdempotencia != clave).toList());

  /// Marca un fallo y programa el siguiente intento.
  BandejaDeSalida fallo(
    String clave,
    DateTime ahora,
    String error, {
    PoliticaDeReintento politica = const PoliticaDeReintento(),
    double Function()? aleatorio,
  }) =>
      BandejaDeSalida([
        for (final p in pendientes)
          if (p.claveDeIdempotencia != clave)
            p
          else
            p.copiaCon(
              intentos: p.intentos + 1,
              proximoIntentoEn: ahora.add(
                esperaAntesDe(p.intentos + 1, politica: politica, aleatorio: aleatorio),
              ),
              ultimoError: error,
            ),
      ]);

  /// Los que ya no se van a reintentar. NO se borran: se muestran.
  ///
  /// Borrarlos en silencio sería perder una visita que el residente cree
  /// creada. La pantalla tiene que poder decir «esto no se envió» y ofrecer
  /// reintentar a mano — con la MISMA clave, que sigue guardada.
  List<EnvioPendiente> rendidos({
    PoliticaDeReintento politica = const PoliticaDeReintento(),
  }) =>
      pendientes.where((p) => p.intentos >= politica.intentosMaximos).toList();
}
