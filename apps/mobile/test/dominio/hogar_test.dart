import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/hogar.dart';

void main() {
  test('D5 a · el rechazo por tope se reconoce; los demás no', () {
    expect(const VehiculoRechazado(motivo: 'TOPE_ALCANZADO', explicacion: '').esTope, isTrue);
    expect(const VehiculoRechazado(motivo: 'PLACA_DUPLICADA', explicacion: '').esTope, isFalse);
  });

  test('3.3 · las plazas libres son las que tienen código', () {
    const o = MisOcupantes(
      declarados: 2,
      declarada: true,
      aviso: '',
      tope: 4,
      esTitular: true,
      plazas: [
        PlazaDeOcupante(id: 'a', numero: 1, libre: false, codigo: null, ocupante: 'Ana'),
        PlazaDeOcupante(id: 'b', numero: 2, libre: true, codigo: 'ABCD-EFGH', ocupante: null),
      ],
    );
    expect(o.libres.map((p) => p.id), ['b']);
  });
}
