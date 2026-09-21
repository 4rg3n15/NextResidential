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
/// 1. **Un rechazo de negocio NO se reintenta.** Si el conjunto dice «esta
///    persona está en lista negra», insistir ocho veces no la va a sacar de la
///    lista: se saca de la bandeja y se le enseña al residente. Reintentar solo
///    tiene sentido ante un fallo de transporte.
/// 2. **La clave viaja intacta.** El reintento repite la del primer intento, y
///    por eso el servidor devuelve la visita anterior en vez de crear otra
///    (RN-17). Una clave nueva por intento convertiría la bandeja en una
///    fábrica de duplicados.
/// 3. **Lo que se rinde no se borra.** Queda en la bandeja, visible, con su
///    clave: el reintento a mano sigue siendo idempotente.
library;

import 'dart:async';

import '../dominio/bandeja_de_salida.dart';
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

class Rechazado extends DesenlaceDeEnvio {
  const Rechazado(this.resultado);
  final VisitaRechazada resultado;
}

class Pendiente extends DesenlaceDeEnvio {
  const Pendiente(this.motivo);

  /// Por qué no se pudo: se muestra tal cual en la lista de pendientes.
  final String motivo;
}

/// Serializa una visita para guardarla mientras espera. El cuerpo es un mapa
/// plano a propósito: lo que se guarda tiene que sobrevivir a un cierre de la
/// app, y un objeto del dominio con `DateTime` dentro no se guarda solo.
Map<String, Object?> cuerpoDe(NuevaVisita v) => {
      'visitante': v.visitante,
      'documento': v.documento,
      'desde': v.desde.toIso8601String(),
      'hasta': v.hasta.toIso8601String(),
      'placa': v.placa,
      'permiteAccesoVehicular': v.permiteAccesoVehicular,
      'acompanantes': v.acompanantes,
      'zonasPermitidas': v.zonasPermitidas,
      'observaciones': v.observaciones,
      'patron': v.patron == null
          ? null
          : {
              'dias': v.patron!.dias.map((d) => d.index).toList()..sort(),
              'minutoInicio': v.patron!.minutoInicio,
              'minutoFin': v.patron!.minutoFin,
              'desplazamientoUtcMinutos': v.patron!.desplazamientoUtcMinutos,
            },
      'claveDeIdempotencia': v.claveDeIdempotencia,
    };

/// Reconstruye la visita guardada. Devuelve `null` si el cuerpo no tiene la
/// forma esperada —una versión anterior de la app, un guardado a medias—: un
/// envío ilegible se descarta en vez de reventar el vaciado de la bandeja
/// entera, que es lo que dejaría al residente sin enviar nada nunca más.
NuevaVisita? visitaDe(Map<String, Object?> c) {
  final visitante = c['visitante'];
  final desde = c['desde'];
  final hasta = c['hasta'];
  final clave = c['claveDeIdempotencia'];
  if (visitante is! String || desde is! String || hasta is! String || clave is! String) {
    return null;
  }
  final patron = c['patron'];
  return NuevaVisita(
    visitante: visitante,
    documento: c['documento'] as String?,
    desde: DateTime.parse(desde),
    hasta: DateTime.parse(hasta),
    placa: c['placa'] as String?,
    permiteAccesoVehicular: c['permiteAccesoVehicular'] == true,
    acompanantes: List<String>.from((c['acompanantes'] as List?) ?? const []),
    zonasPermitidas: List<String>.from((c['zonasPermitidas'] as List?) ?? const []),
    observaciones: c['observaciones'] as String?,
    patron: patron is! Map
        ? null
        : PatronDeVisita(
            dias: {
              for (final d in (patron['dias'] as List? ?? const []))
                DiaDeSemana.values[(d as num).toInt()],
            },
            minutoInicio: (patron['minutoInicio'] as num).toInt(),
            minutoFin: (patron['minutoFin'] as num).toInt(),
            desplazamientoUtcMinutos: (patron['desplazamientoUtcMinutos'] as num).toInt(),
          ),
    claveDeIdempotencia: clave,
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

  /// Los rechazos que el residente todavía no ha visto, por clave.
  final Map<String, VisitaRechazada> rechazos = {};

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
        recurso: 'mi/autorizaciones',
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
      if (r is VisitaCreada) return Aceptado(r);
      final rechazo = r as VisitaRechazada;
      rechazos[visita.claveDeIdempotencia] = rechazo;
      return Rechazado(rechazo);
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
      // 401 y 403 no son problemas de transporte: reintentarlos ocho veces con
      // retroceso exponencial solo retrasa el momento de decírselo.
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
