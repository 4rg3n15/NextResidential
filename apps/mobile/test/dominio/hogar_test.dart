import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/hogar.dart';

void main() {
  test('punto 5 · una ruta suelta se completa con la URL de la API', () {
    expect(
      enlaceParaCompartir('/consentimiento/abc', 'http://api.invalid:3000/'),
      'http://api.invalid:3000/consentimiento/abc',
    );
    expect(
      enlaceParaCompartir('consentimiento/abc', 'http://api.invalid:3000'),
      'http://api.invalid:3000/consentimiento/abc',
    );
    // Si la API ya declaró su URL pública, el enlace no se toca.
    expect(
      enlaceParaCompartir('https://publica.invalid/consentimiento/abc', 'http://api.invalid'),
      'https://publica.invalid/consentimiento/abc',
    );
  });

  test('RN-10 · el mensaje dice que decide el visitante y lleva el enlace', () {
    final m = mensajeParaElVisitante('Carlos', 'http://x.invalid/c/1');
    expect(m, contains('Carlos'));
    expect(m, contains('usted mismo'));
    expect(m, endsWith('http://x.invalid/c/1'));
  });

  test('D5 a · el rechazo por tope se reconoce; los demás no', () {
    expect(const VehiculoRechazado(motivo: 'TOPE_ALCANZADO', explicacion: '').esTope, isTrue);
    expect(const VehiculoRechazado(motivo: 'PLACA_DUPLICADA', explicacion: '').esTope, isFalse);
  });

  test('3.3 · las plazas libres son las que tienen código', () {
    const o = MisOcupantes(
      declarados: 2,
      declarada: true,
      aviso: '',
      plazas: [
        PlazaDeOcupante(id: 'a', numero: 1, libre: false, codigo: null, ocupante: 'Ana'),
        PlazaDeOcupante(id: 'b', numero: 2, libre: true, codigo: 'ABCD-EFGH', ocupante: null),
      ],
    );
    expect(o.libres.map((p) => p.id), ['b']);
  });
}
