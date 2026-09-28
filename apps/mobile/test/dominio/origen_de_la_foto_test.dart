/// De dónde sale la foto y por qué a veces no llega: cada motivo se dice con
/// su salida, y distinto según se haya pedido la cámara o la galería.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/origen_de_la_foto.dart';

void main() {
  test('cada motivo y cada origen tienen su aviso, y ninguno se repite', () {
    final avisos = {
      for (final m in MotivoSinFoto.values)
        for (final o in OrigenDeFoto.values) avisoSinFoto(m, o),
    };
    expect(avisos, hasLength(MotivoSinFoto.values.length * OrigenDeFoto.values.length));
  });

  test('un permiso negado dice DÓNDE activarlo, y cuál', () {
    final camara = avisoSinFoto(MotivoSinFoto.sinPermiso, OrigenDeFoto.camara);
    final galeria = avisoSinFoto(MotivoSinFoto.sinPermiso, OrigenDeFoto.galeria);
    expect(camara, contains('Ajustes del teléfono'));
    expect(camara, contains('«Cámara»'));
    expect(galeria, contains('Ajustes del teléfono'));
    expect(galeria, contains('«Fotos»'));
  });

  test('una imagen ilegible de la galería ofrece otra salida: elegir otra o la cámara', () {
    final aviso = avisoSinFoto(MotivoSinFoto.ilegible, OrigenDeFoto.galeria);
    expect(aviso, contains('No se pudo leer esa imagen'));
    expect(aviso, contains('nube'), reason: 'la foto de iCloud que no terminó de bajar');
    expect(aviso, contains('Elija otra'));
  });

  test('la cámara que no abre conserva el aviso de siempre', () {
    expect(
      avisoSinFoto(MotivoSinFoto.noSeAbrio, OrigenDeFoto.camara),
      startsWith('No se pudo abrir la cámara'),
    );
    expect(
      avisoSinFoto(MotivoSinFoto.noSeAbrio, OrigenDeFoto.galeria),
      startsWith('No se pudo abrir la galería'),
    );
  });

  test('el fallo tipado se nombra por su motivo, no por un texto', () {
    const f = FotoNoObtenida(MotivoSinFoto.ilegible);
    expect(f, isA<Exception>());
    expect(f.toString(), 'FotoNoObtenida(ilegible)');
  });
}
