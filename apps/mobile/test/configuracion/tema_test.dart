import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/configuracion/paleta.g.dart';
import 'package:ncr_residente/configuracion/tema.dart';

/// El tema de la app contra el preset de la consola — **D-78 cerrada**.
///
/// Ya no se comparan colores contra el texto del `.ts`: la paleta se GENERA
/// desde el preset compilado (`pnpm paleta`) y el control `paleta:desfasada`
/// rompe el build si el generado y el preset se separan. Lo que esta prueba
/// comprueba ahora es lo que un generador no puede: que nadie vuelva a escribir
/// un color a mano en `tema.dart`, que los dos temas declaren los mismos
/// tokens, y que el modo oscuro use los del tema oscuro.
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
  test('la paleta se GENERA desde el preset: ni un hexadecimal a mano', () {
    // D-78 cerrada. La prueba anterior leía el `.ts` como TEXTO y comprobaba
    // que cada color copiado siguiera apareciendo allí. Daba verde sobre tres
    // divergencias reales —entre ellas `bordeOscuro`, que usaba el borde del
    // tema CLARO— porque la cadena existía en el fichero, aunque con otro papel.
    //
    // Ahora la comprobación es de forma, no de contenido: si `tema.dart` vuelve
    // a llevar un `0xFF…`, alguien copió un color a mano y la deuda reabrió.
    final tema = File('lib/configuracion/tema.dart').readAsStringSync();
    expect(
      RegExp(r'0x[Ff][Ff][0-9A-Fa-f]{6}').hasMatch(tema),
      isFalse,
      reason: 'hay un color escrito a mano en tema.dart: use un token de paleta.g.dart',
    );

    final generada = File('lib/configuracion/paleta.g.dart');
    expect(generada.existsSync(), isTrue, reason: 'falta paleta.g.dart: ejecute `pnpm paleta`');
    expect(
      generada.readAsStringSync(),
      contains('NO EDITAR A MANO'),
      reason: 'el fichero generado tiene que decir que lo es',
    );
  });

  test('los dos temas declaran los MISMOS tokens', () {
    // Un token que solo existe en claro es un color que desaparece al cambiar
    // de tema, y no lo nota nadie hasta que alguien usa el modo oscuro.
    expect(PaletaClara.porNombre.keys.toSet(), PaletaOscura.porNombre.keys.toSet());
    expect(tokensDePaleta.toSet(), PaletaClara.porNombre.keys.toSet());
    expect(tokensDePaleta.length, greaterThanOrEqualTo(30));
  });

  test('el modo oscuro usa los tokens del tema OSCURO, no los del claro', () {
    // La divergencia concreta que destapó la generación: `bordeOscuro` era el
    // borde de la familia `oscuro.*` del tema CLARO.
    expect(Paleta.fondoOscuro, PaletaOscura.lienzo);
    expect(Paleta.tarjetaOscura, PaletaOscura.tarjeta);
    expect(Paleta.bordeOscuro, PaletaOscura.borde);
    expect(Paleta.bordeOscuro, isNot(PaletaClara.oscuroBorde));
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
