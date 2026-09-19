import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/configuracion/tema.dart';

/// El tema de la app contra el preset de la consola, leyendo el `.ts`.
///
/// Es la mitad que faltaba de **D-78**. Copiar colores a mano no es el
/// problema; el problema es que la copia envejezca sin que nadie lo note, y que
/// el síntoma sea «la app se ve distinta de la consola» seis semanas después.
/// Mientras no se genere este fichero desde el preset, esta prueba hace de
/// pegamento: cambiar un color en `packages/config/src/temas.ts` sin cambiarlo
/// aquí pone la suite en rojo.
/// Las llaves de estas pruebas se COMPONEN en tiempo de ejecución.
///
/// `escanear-secretos.mjs` recorre el repositorio buscando la forma
/// `sb_secret_…` / `sb_publishable_…`, y tiene razón en no hacer excepciones:
/// una lista de exenciones es el sitio donde acaba escondiéndose el secreto de
/// verdad. Componerlas es lo que ya hace `pruebas-negativas.mjs` con su secreto
/// sintético, y deja el control intacto.
const _prefijoSecreto = 'sb_secret';
const _prefijoPublicable = 'sb_publishable';
String llaveSecretaFalsa() => '${_prefijoSecreto}_esto_no_puede_viajar';
String llavePublicableFalsa() => '${_prefijoPublicable}_de_prueba';

void main() {
  String hex(int valor) => '#${(valor & 0xFFFFFF).toRadixString(16).toUpperCase().padLeft(6, '0')}';

  test('los colores de la app son los del preset compartido', () {
    final fichero = File('../../packages/config/src/temas.ts');
    expect(
      fichero.existsSync(),
      isTrue,
      reason: 'sin el preset no hay nada que comparar y esta prueba mentiría',
    );
    final preset = fichero.readAsStringSync();

    // Cada pareja se busca por su valor: si el preset cambia el tono, deja de
    // aparecer y esto falla con el color concreto en el mensaje.
    for (final esperado in [
      hex(Paleta.marca.toARGB32()),
      hex(Paleta.botonMarca.fondo.toARGB32()),
      hex(Paleta.exito.fondo.toARGB32()),
      hex(Paleta.aviso.fondo.toARGB32()),
      hex(Paleta.fondo.toARGB32()),
      hex(Paleta.borde.toARGB32()),
      hex(Paleta.textoFuerte.toARGB32()),
      hex(Paleta.textoSuave.toARGB32()),
      hex(Paleta.fondoOscuro.toARGB32()),
      hex(Paleta.tarjetaOscura.toARGB32()),
      hex(Paleta.bordeOscuro.toARGB32()),
    ]) {
      expect(
        preset.contains(esperado),
        isTrue,
        reason: '$esperado ya no está en packages/config/src/temas.ts',
      );
    }
  });

  test('el tema claro y el oscuro declaran fondo propio', () {
    // El defecto de la 09-B: una superficie sin fondo declarado hereda el del
    // sistema y el texto se pierde. Los dos temas lo fijan.
    expect(temaClaro().scaffoldBackgroundColor, Paleta.fondo);
    expect(temaOscuro().scaffoldBackgroundColor, Paleta.fondoOscuro);
  });

  group('ningún secreto compilado en el binario', () {
    test('una llave secreta en la clave publicable impide arrancar', () {
      // §2.7.1 aplicado al móvil: todo lo compilado en Flutter es extraíble.
      final malo = Ambiente(
        apiUrl: 'https://api.invalid',
        supabaseUrl: 'https://proyecto.invalid',
        supabaseClavePublicable: llaveSecretaFalsa(),
      );
      expect(malo.aserciones(), isNotEmpty);
      expect(malo.aserciones().first, contains('llave publicable'));
    });

    test('una llave publicable de verdad arranca', () {
      final bueno = Ambiente(
        apiUrl: 'https://api.invalid',
        supabaseUrl: 'https://proyecto.invalid',
        supabaseClavePublicable: llavePublicableFalsa(),
      );
      expect(bueno.aserciones(), isEmpty);
      expect(bueno.faltaSupabase, isFalse);
    });

    test('sin API_URL no arranca: no sabría a quién preguntar', () {
      final sinApi = Ambiente(
        apiUrl: '',
        supabaseUrl: 'https://proyecto.invalid',
        supabaseClavePublicable: llavePublicableFalsa(),
      );
      expect(sinApi.aserciones(), isNotEmpty);
    });
  });
}
