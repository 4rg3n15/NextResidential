/// La visita, como se guarda mientras espera en la bandeja de salida, y de
/// vuelta.
///
/// Vivía en `envio_de_visitas.dart`. Salió cuando la bandeja pasó a
/// sobrevivir al cierre de la app: ahora este cuerpo se escribe en el llavero
/// del teléfono y se vuelve a leer en otro arranque —quizá de una versión
/// posterior de la app—, y la traducción merece su propio fichero.
library;

import '../dominio/calidad_de_captura.dart';
import '../dominio/entidades.dart';

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
