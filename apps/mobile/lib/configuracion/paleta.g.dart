// GENERADO POR scripts/lib/generar-paleta-dart.mjs — NO EDITAR A MANO.
//
// Fuente: packages/config/src/temas.ts (el mismo preset que usa la consola).
// Regenerar: pnpm paleta   ·   Comprobar: pnpm paleta:desfasada
//
// Cierre de D-78. Antes estos colores se copiaban a mano y una prueba de Dart
// leía el .ts como texto para comprobar que siguieran existiendo allí. Eso no
// veía tres cosas: un token nuevo del preset que la app nunca copió, un color
// que existe en el preset con OTRO papel —#E63946 es marca y peligro a la vez,
// así que buscar la cadena da verde aunque la app lo use para lo que no es— y
// la divergencia del tema OSCURO, del que solo se habían copiado cuatro tonos.
//
// ignore_for_file: prefer_single_quotes
library;

import 'package:flutter/material.dart';

/// Tokens del tema CLARO. Un token por color del preset, sin excepciones.
class PaletaClara {
  static const marca = Color(0xFFE63946);
  static const marcaClaro = Color(0xFFEA6973);
  static const marcaSuave = Color(0xFFFEF3F3);
  static const marcaOscuro = Color(0xFFA23037);
  static const marcaTexto = Color(0xFFA23037);
  static const marcaBoton = Color(0xFFDC3341);
  static const marcaPresionado = Color(0xFF8A2930);
  static const exito = Color(0xFF10B981);
  static const exitoSuave = Color(0xFFD1FAE5);
  static const exitoTexto = Color(0xFF047857);
  static const exitoBoton = Color(0xFF0A855C);
  static const exitoPresionado = Color(0xFF076B4A);
  static const aviso = Color(0xFFF59E0B);
  static const avisoSuave = Color(0xFFFEF3C7);
  static const avisoTexto = Color(0xFFB45309);
  static const peligro = Color(0xFFE63946);
  static const peligroSuave = Color(0xFFFEF3F3);
  static const peligroTexto = Color(0xFFA23037);
  static const peligroBoton = Color(0xFFDC3341);
  static const neutro = Color(0xFF6B7280);
  static const neutroSuave = Color(0xFFF3F4F6);
  static const neutroTexto = Color(0xFF4B5563);
  static const oscuro = Color(0xFF0B0B12);
  static const oscuroProfundo = Color(0xFF040407);
  static const oscuroElevado = Color(0xFF252542);
  static const oscuroSecundario = Color(0xFF11111E);
  static const oscuroBorde = Color(0xFF2A2A3D);
  static const lienzo = Color(0xFFF8F9FA);
  static const tarjeta = Color(0xFFFFFFFF);
  static const campo = Color(0xFFFFFFFF);
  static const borde = Color(0xFFE5E7EB);
  static const bordeSuave = Color(0xFFF3F4F6);
  static const texto = Color(0xFF111827);
  static const textoFuerte = Color(0xFF1E1E1E);
  static const textoApagado = Color(0xFF6B7280);
  static const textoInvertido = Color(0xFFF8F9FA);
  static const textoInvertidoApagado = Color(0xFF9CA3AF);
  static const constanteBlanco = Color(0xFFFFFFFF);
  static const constanteNegro = Color(0xFF000000);
  static const sombra = Color(0xFF111827);

  /// Por nombre de token, para las comprobaciones y para el depurador.
  static const Map<String, Color> porNombre = <String, Color>{
    'marca': marca,
    'marcaClaro': marcaClaro,
    'marcaSuave': marcaSuave,
    'marcaOscuro': marcaOscuro,
    'marcaTexto': marcaTexto,
    'marcaBoton': marcaBoton,
    'marcaPresionado': marcaPresionado,
    'exito': exito,
    'exitoSuave': exitoSuave,
    'exitoTexto': exitoTexto,
    'exitoBoton': exitoBoton,
    'exitoPresionado': exitoPresionado,
    'aviso': aviso,
    'avisoSuave': avisoSuave,
    'avisoTexto': avisoTexto,
    'peligro': peligro,
    'peligroSuave': peligroSuave,
    'peligroTexto': peligroTexto,
    'peligroBoton': peligroBoton,
    'neutro': neutro,
    'neutroSuave': neutroSuave,
    'neutroTexto': neutroTexto,
    'oscuro': oscuro,
    'oscuroProfundo': oscuroProfundo,
    'oscuroElevado': oscuroElevado,
    'oscuroSecundario': oscuroSecundario,
    'oscuroBorde': oscuroBorde,
    'lienzo': lienzo,
    'tarjeta': tarjeta,
    'campo': campo,
    'borde': borde,
    'bordeSuave': bordeSuave,
    'texto': texto,
    'textoFuerte': textoFuerte,
    'textoApagado': textoApagado,
    'textoInvertido': textoInvertido,
    'textoInvertidoApagado': textoInvertidoApagado,
    'constanteBlanco': constanteBlanco,
    'constanteNegro': constanteNegro,
    'sombra': sombra,
  };
}

/// Tokens del tema OSCURO. Declara EXACTAMENTE los mismos nombres que el claro:
/// el generador falla si uno de los dos se queda corto, porque un token que
/// solo existe en claro es un color que desaparece al cambiar de tema.
class PaletaOscura {
  static const marca = Color(0xFFE63946);
  static const marcaClaro = Color(0xFFF0808A);
  static const marcaSuave = Color(0xFF2E1419);
  static const marcaOscuro = Color(0xFFFF9AA2);
  static const marcaTexto = Color(0xFFFF9099);
  static const marcaBoton = Color(0xFFDC3341);
  static const marcaPresionado = Color(0xFFB92B36);
  static const exito = Color(0xFF10B981);
  static const exitoSuave = Color(0xFF0C2A22);
  static const exitoTexto = Color(0xFF4ADE9E);
  static const exitoBoton = Color(0xFF0A855C);
  static const exitoPresionado = Color(0xFF076B4A);
  static const aviso = Color(0xFFF59E0B);
  static const avisoSuave = Color(0xFF2E2109);
  static const avisoTexto = Color(0xFFFBBF24);
  static const peligro = Color(0xFFE63946);
  static const peligroSuave = Color(0xFF2E1419);
  static const peligroTexto = Color(0xFFFF9099);
  static const peligroBoton = Color(0xFFDC3341);
  static const neutro = Color(0xFF6B7280);
  static const neutroSuave = Color(0xFF23232F);
  static const neutroTexto = Color(0xFFB5B8C4);
  static const oscuro = Color(0xFF15151F);
  static const oscuroProfundo = Color(0xFF0B0B12);
  static const oscuroElevado = Color(0xFF2A2A45);
  static const oscuroSecundario = Color(0xFF1B1B28);
  static const oscuroBorde = Color(0xFF33334A);
  static const lienzo = Color(0xFF0F0F16);
  static const tarjeta = Color(0xFF191924);
  static const campo = Color(0xFF20202E);
  static const borde = Color(0xFF33334A);
  static const bordeSuave = Color(0xFF262636);
  static const texto = Color(0xFFEBECF2);
  static const textoFuerte = Color(0xFFFFFFFF);
  static const textoApagado = Color(0xFFA6A8B8);
  static const textoInvertido = Color(0xFFF8F9FA);
  static const textoInvertidoApagado = Color(0xFFA9ADBC);
  static const constanteBlanco = Color(0xFFFFFFFF);
  static const constanteNegro = Color(0xFF000000);
  static const sombra = Color(0xFF000000);

  static const Map<String, Color> porNombre = <String, Color>{
    'marca': marca,
    'marcaClaro': marcaClaro,
    'marcaSuave': marcaSuave,
    'marcaOscuro': marcaOscuro,
    'marcaTexto': marcaTexto,
    'marcaBoton': marcaBoton,
    'marcaPresionado': marcaPresionado,
    'exito': exito,
    'exitoSuave': exitoSuave,
    'exitoTexto': exitoTexto,
    'exitoBoton': exitoBoton,
    'exitoPresionado': exitoPresionado,
    'aviso': aviso,
    'avisoSuave': avisoSuave,
    'avisoTexto': avisoTexto,
    'peligro': peligro,
    'peligroSuave': peligroSuave,
    'peligroTexto': peligroTexto,
    'peligroBoton': peligroBoton,
    'neutro': neutro,
    'neutroSuave': neutroSuave,
    'neutroTexto': neutroTexto,
    'oscuro': oscuro,
    'oscuroProfundo': oscuroProfundo,
    'oscuroElevado': oscuroElevado,
    'oscuroSecundario': oscuroSecundario,
    'oscuroBorde': oscuroBorde,
    'lienzo': lienzo,
    'tarjeta': tarjeta,
    'campo': campo,
    'borde': borde,
    'bordeSuave': bordeSuave,
    'texto': texto,
    'textoFuerte': textoFuerte,
    'textoApagado': textoApagado,
    'textoInvertido': textoInvertido,
    'textoInvertidoApagado': textoInvertidoApagado,
    'constanteBlanco': constanteBlanco,
    'constanteNegro': constanteNegro,
    'sombra': sombra,
  };
}

/// Los nombres de token, en el orden del preset.
const List<String> tokensDePaleta = <String>[
  'marca',
  'marcaClaro',
  'marcaSuave',
  'marcaOscuro',
  'marcaTexto',
  'marcaBoton',
  'marcaPresionado',
  'exito',
  'exitoSuave',
  'exitoTexto',
  'exitoBoton',
  'exitoPresionado',
  'aviso',
  'avisoSuave',
  'avisoTexto',
  'peligro',
  'peligroSuave',
  'peligroTexto',
  'peligroBoton',
  'neutro',
  'neutroSuave',
  'neutroTexto',
  'oscuro',
  'oscuroProfundo',
  'oscuroElevado',
  'oscuroSecundario',
  'oscuroBorde',
  'lienzo',
  'tarjeta',
  'campo',
  'borde',
  'bordeSuave',
  'texto',
  'textoFuerte',
  'textoApagado',
  'textoInvertido',
  'textoInvertidoApagado',
  'constanteBlanco',
  'constanteNegro',
  'sombra',
];
