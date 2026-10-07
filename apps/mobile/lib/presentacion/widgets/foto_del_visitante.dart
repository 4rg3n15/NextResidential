/// F1 · La foto frontal del visitante: tomarla o elegirla de la galería,
/// juzgarla y decir por qué repetirla.
///
/// 15-X · la captura en sí —juicio, consejos, los dos botones— vive ahora en
/// `captura_de_rostro.dart`, que comparte con el rostro del residente; aquí
/// quedan los textos de la visita.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ ES UN WIDGET APARTE
///
/// Vivía dentro de la pantalla de la foto que se tomaba DESPUÉS de crear la
/// visita. Con el formulario nuevo la foto es parte de la visita —sin foto que
/// sirva no se registra—, y la lógica de la calidad es la misma: se extrajo
/// entera en vez de copiarla, porque la copia número dos es la que se queda con
/// el umbral viejo.
///
/// El widget no envía nada. Avisa hacia arriba con la foto QUE SIRVE —con las
/// medidas que viajarán— o con `null` mientras no haya una, y el formulario
/// decide con eso si el botón se habilita.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA CALIDAD SE JUZGA AQUÍ ANTES DE ENVIAR, Y ALLÍ TAMBIÉN
///
/// Aquí porque el residente tiene delante a la persona y puede repetir la foto
/// en ese momento (CA-08); una validación que sólo ocurriera en el servidor
/// llegaría cuando el visitante ya se fue. Allí porque ésta se salta con un
/// cliente modificado (KPI-16). No es duplicación: son dos destinatarios.
///
/// Y se enseñan TODOS los fallos, no el primero: corregir la luz para que le
/// digan que está movida, y sostenerlo quieto para que le digan que se acerque,
/// son tres intentos para lo que se arregla en uno.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SIN DETECTOR DE ROSTROS, EL ENCUADRE SE CONFIRMA; NO SE INVENTA
///
/// La cámara del sistema no cuenta rostros. El conteo y la proporción los
/// sustituye un BOTÓN sobre la foto —«sale una persona, de frente, cerca»—,
/// igual que en la consola. Mientras no se pulse, la foto no sirve, y «no se
/// ve ningún rostro» no se enseña como consejo: nadie lo ha medido todavía.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// DOS BOTONES, UN SOLO JUICIO
///
/// «Tomar foto» y «Elegir de la galería» piden al mismo puerto con distinto
/// origen, y lo que vuelve se juzga aquí igual venga de donde venga: la foto
/// que el visitante mandó por mensaje pasa los mismos umbrales que la que se
/// toma en la portería. Cancelar no cambia nada; lo que no es cancelar —un
/// archivo que no se lee, un permiso negado— se dice con su salida.
library;

import 'package:flutter/material.dart';

import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';
import 'captura_de_rostro.dart';

class FotoDelVisitante extends StatelessWidget {
  const FotoDelVisitante({
    super.key,
    required this.tomarFoto,
    required this.alCambiar,
    this.habilitada = true,
  });

  final TomarFoto tomarFoto;

  /// La foto que sirve, lista para viajar, o `null` si todavía no hay una.
  final ValueChanged<FotoDeVisita?> alCambiar;

  /// `false` mientras el formulario envía: cambiar la foto a medio envío
  /// dejaría al residente sin saber cuál viajó.
  final bool habilitada;

  @override
  Widget build(BuildContext context) => CapturaDeRostro(
    tomarFoto: tomarFoto,
    alCambiar: alCambiar,
    habilitada: habilitada,
    titulo: 'Foto del visitante',
    indicacion:
        'De frente, con buena luz y sin nadie más en la imagen: es la foto con la que '
        'los equipos de reconocimiento facial lo dejarán entrar.',
    textoSiSirve: 'La foto sirve. Viajará con la visita.',
  );
}
