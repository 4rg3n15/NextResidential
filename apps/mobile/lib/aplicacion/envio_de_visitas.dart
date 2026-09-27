/// La bandeja de salida, conectada al cliente HTTP.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUÉ AÑADE SOBRE `dominio/bandeja_de_salida.dart`
///
/// El dominio decide **qué toca enviar y cuándo**; esto lo envía. La separación
/// no es ceremonia: la política de reintento se prueba entera sin red y sin
/// esperar segundos reales porque es una función del estado y del reloj, y aquí
/// solo queda el trozo que necesita un `Timer` y un cliente.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LAS TRES REGLAS QUE GOBIERNAN EL ENVÍO
///
/// 1. **Un rechazo de negocio NO se reintenta**, y una foto que el servidor no
///    aceptó tampoco. Si el conjunto dice «esta persona está en lista negra»,
///    insistir ocho veces no la va a sacar de la lista; si dice que la foto
///    está borrosa, la misma foto seguirá borrosa. Las dos salen de la bandeja
///    y se le enseñan al residente. Reintentar sólo tiene sentido ante un
///    fallo de transporte.
/// 2. **La clave viaja intacta.** El reintento repite la del primer intento, y
///    por eso el servidor devuelve la visita anterior en vez de crear otra
///    (RN-17). Una clave nueva por intento convertiría la bandeja en una
///    fábrica de duplicados.
/// 3. **Lo que se rinde no se borra.** Queda en la bandeja, visible, con su
///    clave: el reintento a mano sigue siendo idempotente.
/// 4. **La bandeja sobrevive al cierre de la app** (15-L). Vivía sólo en
///    memoria: una visita creada sin red se perdía si el residente cerraba la
///    app antes de que volviera. Ahora se guarda en el llavero ANTES del
///    primer intento, con su clave y su foto, y se borra en cuanto el conjunto
///    contesta. Cada envío lleva la cuenta que lo encoló: en un teléfono
///    compartido, lo de un residente no sale con la sesión de otro.
library;

import 'dart:async';

import '../dominio/bandeja_de_salida.dart';
import '../dominio/entidades.dart';
import '../dominio/puertos.dart';
import 'cuerpo_de_visita.dart';

export 'cuerpo_de_visita.dart';

/// Cómo terminó un intento, desde el punto de vista de la bandeja.
sealed class DesenlaceDeEnvio {
  const DesenlaceDeEnvio();
}

class Aceptado extends DesenlaceDeEnvio {
  const Aceptado(this.resultado);
  final VisitaCreada resultado;
}

/// El conjunto contestó y no la creó: un rechazo de negocio o una foto que no
/// le sirvió. Las dos cosas son una respuesta, no un fallo, y ninguna se
/// reintenta.
class Rechazado extends DesenlaceDeEnvio {
  const Rechazado(this.resultado);
  final VisitaNoCreada resultado;
}

class Pendiente extends DesenlaceDeEnvio {
  const Pendiente(this.motivo);

  /// Por qué no se pudo: se muestra tal cual en la lista de pendientes.
  final String motivo;
}

class EnvioDeVisitas {
  EnvioDeVisitas({
    required RepositorioDelResidente repositorio,
    required Reloj reloj,
    PoliticaDeReintento politica = const PoliticaDeReintento(),
    AlmacenDeBandeja? almacen,
    String? Function()? propietario,
    this.maximoPendientes = 10,
  })  : _repo = repositorio,
        _reloj = reloj,
        _politica = politica,
        _almacen = almacen,
        _propietario = propietario ?? _sinPropietario;

  final RepositorioDelResidente _repo;
  final Reloj _reloj;
  final PoliticaDeReintento _politica;
  final AlmacenDeBandeja? _almacen;

  /// De qué cuenta es la sesión de ahora (ver `EnvioPendiente.propietario`).
  final String? Function() _propietario;

  /// Cuántas visitas caben esperando. La foto viaja entera (hasta ~240 KB en
  /// base64 con el techo de 180 KB de la cámara), y la bandeja vive en el
  /// llavero: sin tope, un teléfono sin red durante días acabaría guardando
  /// megas de fotos de visitantes.
  final int maximoPendientes;

  static String? _sinPropietario() => null;

  /// TODO lo guardado, de todas las cuentas. Sólo se enseña y se envía la
  /// parte de la cuenta en uso (`bandeja`).
  BandejaDeSalida _todo = const BandejaDeSalida([]);

  /// Lo que espera de la cuenta en uso.
  BandejaDeSalida get bandeja => _todo.delPropietario(_propietario());

  /// Los rechazos que el residente todavía no ha visto, por clave: de negocio
  /// o de la foto.
  final Map<String, VisitaNoCreada> rechazos = {};

  /// Claves con una petición en vuelo: una segunda no sale mientras tanto.
  final Set<String> _enVuelo = {};
  Future<int>? _vaciando;

  /// Lee la bandeja guardada. Se llama al arrancar: lo que quedó pendiente
  /// antes de cerrar la app sigue pendiente, con su clave. Y se espera antes
  /// de tocar la bandeja por primera vez: encolar sin haber leído lo guardado
  /// escribiría una bandeja sin ello y lo borraría.
  Future<void> recuperar() => _recuperada ??= _leerLoGuardado();
  Future<void>? _recuperada;

  Future<void> _leerLoGuardado() async {
    final almacen = _almacen;
    if (almacen == null) return;
    try {
      _todo = BandejaDeSalida(await almacen.leer());
    } on Object {
      // Un llavero ilegible no puede dejar la app sin arrancar: se sigue con
      // la bandeja vacía, que es lo mismo que había antes de guardarla.
    }
  }

  /// Intenta enviar AHORA. Si no hay red, encola y lo dice.
  ///
  /// El orden importa: se encola —y se GUARDA— **antes** de intentar. Si se
  /// encolara después, una app que muere entre el intento y el encolado
  /// perdería la visita — y es justo el momento en que más probable es que
  /// muera, porque la red acaba de fallar.
  Future<DesenlaceDeEnvio> enviar(NuevaVisita visita) async {
    await recuperar();
    final clave = visita.claveDeIdempotencia;
    final cabe = _todo.contiene(clave) || bandeja.pendientes.length < maximoPendientes;
    if (!cabe) return _intentarSinEncolar(visita);
    _todo = _todo.encolar(
      EnvioPendiente(
        claveDeIdempotencia: clave,
        recurso: 'mi/visitas',
        cuerpo: cuerpoDe(visita),
        encoladoEn: _reloj.ahora(),
        propietario: _propietario(),
      ),
    );
    await _guardar();
    return _intentar(visita);
  }

  /// La bandeja está llena: se intenta sin guardar, y si no sale se dice.
  Future<DesenlaceDeEnvio> _intentarSinEncolar(NuevaVisita visita) async {
    try {
      return _desenlace(visita.claveDeIdempotencia, await _repo.crearVisita(visita));
    } on Fallo catch (f) {
      if (!_esDeTransporte(f)) rethrow;
      throw Fallo(
        ClaseDeFallo.sinConexion,
        'Ya hay $maximoPendientes visitas esperando conexión en este teléfono. Espere a que se '
        'envíen antes de registrar otra.',
        detalleTecnico: f.detalleTecnico,
      );
    }
  }

  Future<DesenlaceDeEnvio> _intentar(NuevaVisita visita) async {
    final clave = visita.claveDeIdempotencia;
    // La misma visita ya está saliendo (el ciclo y el botón a la vez): una
    // segunda petición idéntica no aporta nada y el servidor la tendría que
    // deduplicar.
    if (!_enVuelo.add(clave)) return const Pendiente('Se está enviando.');
    try {
      final r = await _repo.crearVisita(visita);
      // Aceptada o rechazada, sale de la bandeja: en los dos casos el conjunto
      // ya dio su respuesta y reintentar no cambiaría nada.
      _todo = _todo.quitar(clave);
      await _guardar();
      return _desenlace(clave, r);
    } on Fallo catch (f) {
      if (_esDeTransporte(f)) {
        _todo = _todo.fallo(clave, _reloj.ahora(), f.detalle, politica: _politica);
        await _guardar();
        return Pendiente(f.detalle);
      }
      // 401, 403 y un formulario que el servidor no admite (400 · 422) no son
      // problemas de transporte: reintentarlos ocho veces con retroceso
      // exponencial solo retrasa el momento de decírselo.
      _todo = _todo.quitar(clave);
      await _guardar();
      rethrow;
    } finally {
      _enVuelo.remove(clave);
    }
  }

  DesenlaceDeEnvio _desenlace(String clave, ResultadoDeVisita r) {
    switch (r) {
      case VisitaCreada():
        return Aceptado(r);
      case VisitaNoCreada():
        rechazos[clave] = r;
        return Rechazado(r);
    }
  }

  static bool _esDeTransporte(Fallo f) =>
      f.clase == ClaseDeFallo.sinConexion || f.clase == ClaseDeFallo.servidor;

  Future<void> _guardar() async {
    try {
      await _almacen?.guardar(_todo.pendientes);
    } on Object {
      // Si el llavero falla, la bandeja en memoria sigue enviando: perder la
      // persistencia es peor que nada, pero perder el envío sería peor aún.
    }
  }

  /// Vacía lo que toque. Se llama al volver a primer plano, en cada vuelta del
  /// ciclo de recarga y al recuperar la red — y si ya se está vaciando, se
  /// espera a ESE vaciado en vez de empezar otro con las mismas visitas.
  ///
  /// Devuelve cuántos se aceptaron, para que la pantalla pueda decir «se
  /// enviaron 2 visitas pendientes» en vez de cambiar la lista sin explicación.
  Future<int> vaciar() => _vaciando ??= _vaciar().whenComplete(() => _vaciando = null);

  Future<int> _vaciar() async {
    await recuperar();
    var aceptados = 0;
    for (final pendiente in bandeja.listosEn(_reloj.ahora())) {
      final visita = visitaDe(pendiente.cuerpo);
      if (visita == null) {
        _todo = _todo.quitar(pendiente.claveDeIdempotencia);
        await _guardar();
        continue;
      }
      try {
        final r = await _intentar(visita);
        if (r is Aceptado) aceptados += 1;
      } on Fallo {
        // La sesión murió a mitad del vaciado. Se deja lo que queda para el
        // próximo intento en vez de recorrer la lista entera fallando.
        break;
      }
    }
    return aceptados;
  }

  /// Lo que ya no se reintentará solo. NO se borra: se enseña.
  List<EnvioPendiente> get rendidos => bandeja.rendidos(politica: _politica);
}
