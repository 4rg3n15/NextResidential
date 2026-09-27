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
library;

import 'dart:async';

import '../dominio/bandeja_de_salida.dart';
import '../dominio/calidad_de_captura.dart';
import '../dominio/entidades.dart';
import '../dominio/puertos.dart';

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

/// Serializa una visita para guardarla mientras espera. El cuerpo es un mapa
/// plano a propósito: lo que se guarda tiene que sobrevivir a un cierre de la
/// app, y un objeto del dominio con `DateTime` dentro no se guarda solo.
///
/// La foto va entera —el JPEG en base64 y sus medidas— y la casilla también:
/// el reintento tiene que enviar EXACTAMENTE lo que el residente compuso, y
/// una visita encolada sin su foto sería otra visita.
Map<String, Object?> cuerpoDe(NuevaVisita v) => {
      'visitante': v.visitante,
      'documento': v.documento,
      'inicio': v.inicio.toUtc().toIso8601String(),
      'duracionMinutos': v.duracionMinutos,
      'placa': v.placa,
      'observaciones': v.observaciones,
      'foto': {
        'jpegBase64': v.foto.jpegBase64,
        'medidas': {
          'nitidez': v.foto.medidas.nitidez,
          'iluminacion': v.foto.medidas.iluminacion,
          'rostrosDetectados': v.foto.medidas.rostrosDetectados,
          'proporcionRostro': v.foto.medidas.proporcionRostro,
        },
      },
      'casillaMarcada': v.casillaMarcada,
      'claveDeIdempotencia': v.claveDeIdempotencia,
    };

/// Reconstruye la visita guardada. Devuelve `null` si el cuerpo no tiene la
/// forma esperada —una versión anterior de la app, un guardado a medias—: un
/// envío ilegible se descarta en vez de reventar el vaciado de la bandeja
/// entera, que es lo que dejaría al residente sin enviar nada nunca más.
///
/// Se comprueba CADA campo, no sólo los primeros: una visita que se leyera sin
/// su foto o sin la casilla saldría hacia el servidor como algo que el
/// residente no compuso.
NuevaVisita? visitaDe(Map<String, Object?> c) {
  final visitante = c['visitante'];
  final documento = c['documento'];
  final inicio = c['inicio'] is String ? DateTime.tryParse(c['inicio']! as String) : null;
  final duracion = c['duracionMinutos'];
  final placa = c['placa'];
  final observaciones = c['observaciones'];
  final casilla = c['casillaMarcada'];
  final clave = c['claveDeIdempotencia'];
  final foto = _fotoDe(c['foto']);
  if (visitante is! String ||
      documento is! String ||
      inicio == null ||
      duracion is! int ||
      (placa != null && placa is! String) ||
      (observaciones != null && observaciones is! String) ||
      casilla is! bool ||
      clave is! String ||
      foto == null) {
    return null;
  }
  return NuevaVisita(
    visitante: visitante,
    documento: documento,
    inicio: inicio,
    duracionMinutos: duracion,
    placa: placa as String?,
    observaciones: observaciones as String?,
    foto: foto,
    casillaMarcada: casilla,
    claveDeIdempotencia: clave,
  );
}

FotoDeVisita? _fotoDe(Object? f) {
  if (f is! Map) return null;
  final jpeg = f['jpegBase64'];
  final m = f['medidas'];
  if (jpeg is! String || m is! Map) return null;
  final nitidez = m['nitidez'];
  final iluminacion = m['iluminacion'];
  final rostros = m['rostrosDetectados'];
  final proporcion = m['proporcionRostro'];
  if (nitidez is! num || iluminacion is! num || rostros is! int || proporcion is! num) {
    return null;
  }
  return FotoDeVisita(
    jpegBase64: jpeg,
    medidas: MedidasDeCaptura(
      nitidez: nitidez.toDouble(),
      iluminacion: iluminacion.toDouble(),
      rostrosDetectados: rostros,
      proporcionRostro: proporcion.toDouble(),
    ),
  );
}

class EnvioDeVisitas {
  EnvioDeVisitas({
    required RepositorioDelResidente repositorio,
    required Reloj reloj,
    PoliticaDeReintento politica = const PoliticaDeReintento(),
  })  : _repo = repositorio,
        _reloj = reloj,
        _politica = politica;

  final RepositorioDelResidente _repo;
  final Reloj _reloj;
  final PoliticaDeReintento _politica;

  BandejaDeSalida _bandeja = const BandejaDeSalida([]);
  BandejaDeSalida get bandeja => _bandeja;

  /// Los rechazos que el residente todavía no ha visto, por clave: de negocio
  /// o de la foto.
  final Map<String, VisitaNoCreada> rechazos = {};

  /// Intenta enviar AHORA. Si no hay red, encola y lo dice.
  ///
  /// El orden importa: se encola **antes** de intentar. Si se encolara después,
  /// una app que muere entre el intento y el encolado perdería la visita — y es
  /// justo el momento en que más probable es que muera, porque la red acaba de
  /// fallar.
  Future<DesenlaceDeEnvio> enviar(NuevaVisita visita) async {
    _bandeja = _bandeja.encolar(
      EnvioPendiente(
        claveDeIdempotencia: visita.claveDeIdempotencia,
        recurso: 'mi/visitas',
        cuerpo: cuerpoDe(visita),
        encoladoEn: _reloj.ahora(),
      ),
    );
    return _intentar(visita);
  }

  Future<DesenlaceDeEnvio> _intentar(NuevaVisita visita) async {
    try {
      final r = await _repo.crearVisita(visita);
      // Aceptada o rechazada, sale de la bandeja: en los dos casos el conjunto
      // ya dio su respuesta y reintentar no cambiaría nada.
      _bandeja = _bandeja.quitar(visita.claveDeIdempotencia);
      switch (r) {
        case VisitaCreada():
          return Aceptado(r);
        case VisitaNoCreada():
          rechazos[visita.claveDeIdempotencia] = r;
          return Rechazado(r);
      }
    } on Fallo catch (f) {
      if (f.clase == ClaseDeFallo.sinConexion || f.clase == ClaseDeFallo.servidor) {
        _bandeja = _bandeja.fallo(
          visita.claveDeIdempotencia,
          _reloj.ahora(),
          f.detalle,
          politica: _politica,
        );
        return Pendiente(f.detalle);
      }
      // 401, 403 y un formulario que el servidor no admite (400 · 422) no son
      // problemas de transporte: reintentarlos ocho veces con retroceso
      // exponencial solo retrasa el momento de decírselo.
      _bandeja = _bandeja.quitar(visita.claveDeIdempotencia);
      rethrow;
    }
  }

  /// Vacía lo que toque. Se llama al volver a primer plano y al recuperar red.
  ///
  /// Devuelve cuántos se aceptaron, para que la pantalla pueda decir «se
  /// enviaron 2 visitas pendientes» en vez de cambiar la lista sin explicación.
  Future<int> vaciar() async {
    var aceptados = 0;
    for (final pendiente in _bandeja.listosEn(_reloj.ahora())) {
      final visita = visitaDe(pendiente.cuerpo);
      if (visita == null) {
        _bandeja = _bandeja.quitar(pendiente.claveDeIdempotencia);
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
  List<EnvioPendiente> get rendidos => _bandeja.rendidos(politica: _politica);
}
