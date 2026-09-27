/// De dónde sale la foto del visitante cuando no hay cámara.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ HAY UN SIMULADO Y ESTÁ DECLARADO
///
/// Es ADR-03 aplicado al teléfono: **todo el ciclo tiene que funcionar sin el
/// aparato**. El formulario, la validación de calidad, el envío con la casilla
/// y la sincronización de la foto con los equipos se ejercen enteros contra
/// esta fuente, igual que el resto del sistema se ejerce contra `MockProvider`.
/// Si hiciera falta una cámara para demostrarlo, el desacople habría fallado.
///
/// El adaptador real es `CamaraDelTelefono`; éste queda para el destino web
/// (el recorrido del verificador) y para las pruebas. El puerto es el mismo.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL SIMULADO NO MIENTE, NI SOBRE LA CALIDAD NI SOBRE LOS BYTES
///
/// Produce medidas que no siempre son buenas, así que quien lo use ve los
/// mismos consejos y los mismos rechazos que vería con una cámara: una fuente
/// que devolviera siempre una foto perfecta convertiría la validación en
/// adorno.
///
/// Y los bytes son un JPEG DE VERDAD, pequeño y gris. El servidor comprueba
/// que el contenido sea la imagen que dice ser; unos bytes al azar harían que
/// el recorrido sin cámara fallara justo en el paso que pretende demostrar.
library;

import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../../dominio/calidad_de_captura.dart';
import '../../dominio/puertos.dart';

class CamaraSimulada {
  CamaraSimulada({int? semilla, this.siempreBuena = false}) : _azar = Random(semilla ?? 20260920);

  final Random _azar;

  /// Para el recorrido de demostración, donde repetir la foto cuatro veces no
  /// aporta nada. Fuera de ahí se deja en `false` A PROPÓSITO.
  final bool siempreBuena;

  Future<FotoTomada?> tomar() async {
    // Una espera corta: sin ella, el formulario nunca enseñaría su estado de
    // «tomando» y ese estado quedaría sin ejercer.
    await Future<void>.delayed(const Duration(milliseconds: 120));
    final medidas = siempreBuena
        ? const MedidasDeCaptura(
            nitidez: 0.82,
            iluminacion: 0.52,
            rostrosDetectados: 1,
            proporcionRostro: 0.38,
          )
        : MedidasDeCaptura(
            nitidez: 0.3 + _azar.nextDouble() * 0.65,
            iluminacion: 0.15 + _azar.nextDouble() * 0.75,
            rostrosDetectados: _azar.nextInt(10) == 0 ? 2 : 1,
            proporcionRostro: 0.1 + _azar.nextDouble() * 0.5,
          );
    return FotoTomada(jpeg: _jpegGris(), medidas: medidas);
  }

  /// Un degradado de 64×64 codificado como JPEG: unos cientos de bytes que
  /// cualquier descodificador reconoce.
  Uint8List _jpegGris() {
    final tono = 90 + _azar.nextInt(80);
    final imagen = img.Image(width: 64, height: 64);
    for (final p in imagen) {
      final v = (tono + (p.x + p.y) ~/ 4).clamp(0, 255);
      p
        ..r = v
        ..g = v
        ..b = v;
    }
    return Uint8List.fromList(img.encodeJpg(imagen, quality: 80));
  }
}
