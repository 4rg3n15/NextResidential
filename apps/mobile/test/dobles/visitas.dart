import 'dart:typed_data';

import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';

/// Piezas de visita para las pruebas (15-L, bloque F): una foto que sirve, una
/// que no, y una visita completa. Están aquí y no repetidas porque la tercera
/// copia es la que se queda sin la casilla.
const medidasBuenas = MedidasDeCaptura(
  nitidez: 0.8,
  iluminacion: 0.5,
  rostrosDetectados: 1,
  proporcionRostro: 0.4,
);

const medidasMalas = MedidasDeCaptura(
  nitidez: 0.05,
  iluminacion: 0.02,
  rostrosDetectados: 2,
  proporcionRostro: 0.02,
);

/// Bytes con la cabecera de un JPEG. No se descodifican en ninguna prueba: lo
/// que se comprueba es que viajan, no cómo se pintan.
final bytesDeJpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, ...List<int>.filled(60, 7)]);

FotoTomada fotoTomada(MedidasDeCaptura medidas, {bool sinDetector = false}) =>
    FotoTomada(jpeg: bytesDeJpeg, medidas: medidas, sinDetector: sinDetector);

FotoDeVisita fotoDeVisita() => FotoDeVisita.deJpeg(bytesDeJpeg, medidasBuenas);

NuevaVisita visitaDePrueba(String clave, {String? placa = 'ABC123'}) => NuevaVisita(
      visitante: 'Visitante de prueba',
      documento: '1020304050',
      inicio: DateTime.utc(2026, 9, 20, 14),
      duracionMinutos: 240,
      placa: placa,
      observaciones: 'sin observaciones',
      foto: fotoDeVisita(),
      casillaMarcada: true,
      claveDeIdempotencia: clave,
    );

VisitanteReciente recienteDePrueba({
  String autorizacionId = 'aut-7',
  String visitante = 'Plomero Pérez',
  bool tieneFoto = true,
}) =>
    VisitanteReciente(
      autorizacionId: autorizacionId,
      visitante: visitante,
      documento: '79000111',
      ultimaVisita: DateTime.utc(2026, 9, 12, 15),
      placa: 'XYZ987',
      tieneFoto: tieneFoto,
    );
