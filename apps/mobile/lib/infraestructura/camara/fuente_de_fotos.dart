/// De dónde sale la foto del visitante.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ HAY UN SIMULADO Y ESTÁ DECLARADO
///
/// Es ADR-03 aplicado al teléfono: **todo el ciclo tiene que funcionar sin el
/// aparato**. La pantalla, la validación de calidad, el envío, la solicitud de
/// consentimiento al titular y el bloqueo de sincronización sin respuesta se
/// ejercen enteros contra esta fuente, igual que el resto del sistema se ejerce
/// contra `MockProvider`. Si hiciera falta una cámara para demostrarlo, el
/// desacople habría fallado.
///
/// Lo que falta, y se dice: el adaptador real sobre el paquete `camera`, con el
/// permiso del sistema y la detección de rostro del aparato. Lleva binarios
/// nativos por plataforma y un permiso que solo se puede probar en un
/// dispositivo, así que se construye cuando la app se compile contra uno. El
/// puerto no cambia: lo que cambia es quién lo implementa.
///
/// **El simulado no miente sobre su resultado.** Produce medidas reales —no
/// siempre buenas—, así que el residente que lo use ve los mismos consejos y
/// los mismos rechazos que vería con una cámara. Una fuente que devolviera
/// siempre una foto perfecta convertiría la validación de calidad en adorno.
library;

import 'dart:math';
import 'dart:typed_data';

import '../../dominio/calidad_de_captura.dart';
import '../../presentacion/pantallas/rostro_del_visitante.dart';

class CamaraSimulada {
  CamaraSimulada({int? semilla, this.siempreBuena = false}) : _azar = Random(semilla ?? 20260920);

  final Random _azar;

  /// Para el recorrido de demostración, donde repetir la foto cuatro veces no
  /// aporta nada. Fuera de ahí se deja en `false` A PROPÓSITO.
  final bool siempreBuena;

  Future<FotoTomada?> tomar() async {
    // Una espera corta: sin ella, la pantalla nunca enseñaría su estado de
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
    return FotoTomada(
      // Un vector, no una foto: lo que viaja es la plantilla derivada, y ni eso
      // se queda en el teléfono.
      vector: Uint8List.fromList(List<int>.generate(128, (_) => _azar.nextInt(256))),
      medidas: medidas,
    );
  }
}
