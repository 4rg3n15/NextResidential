/// F1 · La foto frontal del visitante: tomarla, juzgarla y decir por qué
/// repetirla.
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
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/calidad_de_captura.dart';
import '../../dominio/entidades.dart';
import '../../dominio/medidas_de_imagen.dart';
import '../../dominio/puertos.dart';

class FotoDelVisitante extends StatefulWidget {
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
  State<FotoDelVisitante> createState() => _EstadoDeLaFoto();
}

class _EstadoDeLaFoto extends State<FotoDelVisitante> {
  FotoTomada? _foto;
  bool _encuadreConfirmado = false;
  List<FalloDeCalidad> _fallos = const [];
  bool _tomando = false;
  bool _sinCamara = false;

  /// Lo que se juzga es lo que se envía: con la confirmación del encuadre, las
  /// medidas llevan un rostro y la proporción declarada; sin ella, cero.
  MedidasDeCaptura? get _medidasEfectivas {
    final f = _foto;
    if (f == null) return null;
    return f.sinDetector && _encuadreConfirmado ? conEncuadreConfirmado(f.medidas) : f.medidas;
  }

  bool get _faltaConfirmar => (_foto?.sinDetector ?? false) && !_encuadreConfirmado;

  /// Mientras falta confirmar el encuadre, «no se ve ningún rostro» no es un
  /// consejo: es que nadie lo ha medido todavía. Se enseña el resto (luz,
  /// nitidez), que sí sale de la foto.
  List<FalloDeCalidad> get _consejosVisibles => _faltaConfirmar
      ? _fallos
          .where((f) => f != FalloDeCalidad.sinRostro && f != FalloDeCalidad.demasiadoLejos)
          .toList()
      : _fallos;

  Future<void> _tomar() async {
    setState(() {
      _tomando = true;
      _sinCamara = false;
    });
    try {
      final foto = await widget.tomarFoto();
      // Cancelar la cámara no borra la foto que ya servía.
      if (!mounted || foto == null) return;
      setState(() {
        _foto = foto;
        _encuadreConfirmado = false;
        // El juicio del dominio, no un `if` aquí: los umbrales viven en un sitio.
        _fallos = evaluarCaptura(foto.medidas);
      });
      _avisar();
    } on Exception {
      // Permiso de cámara denegado, cámara ocupada: el residente tiene que
      // saberlo, no quedarse mirando un botón que no hizo nada.
      if (mounted) setState(() => _sinCamara = true);
    } finally {
      if (mounted) setState(() => _tomando = false);
    }
  }

  void _confirmarEncuadre() {
    final f = _foto;
    if (f == null) return;
    setState(() {
      _encuadreConfirmado = true;
      _fallos = evaluarCaptura(conEncuadreConfirmado(f.medidas));
    });
    _avisar();
  }

  /// La guarda no es cosmética: una foto que el propio widget rechazó no sale
  /// de aquí, aunque el formulario olvidara mirar.
  void _avisar() {
    final f = _foto;
    final m = _medidasEfectivas;
    widget.alCambiar(
      f != null && m != null && _fallos.isEmpty ? FotoDeVisita.deJpeg(f.jpeg, m) : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final foto = _foto;
    final activa = widget.habilitada && !_tomando;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Foto del visitante', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        const Text(
          'De frente, con buena luz y sin nadie más en la imagen: es la foto con la que '
          'los equipos de reconocimiento facial lo dejarán entrar.',
          style: TextStyle(color: Paleta.textoSuave, fontSize: 13),
        ),
        const SizedBox(height: 12),
        if (foto?.vistaPrevia != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              foto!.vistaPrevia!,
              height: 220,
              fit: BoxFit.cover,
              // Una vista previa ilegible no puede tumbar el formulario: la
              // foto se juzgó por sus medidas, no por cómo se pinta.
              errorBuilder: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (foto != null && _faltaConfirmar) ...[
          OutlinedButton.icon(
            key: const Key('foto.confirmarEncuadre'),
            onPressed: activa ? _confirmarEncuadre : null,
            icon: const Icon(Icons.center_focus_strong_outlined),
            label: const Text('Encuadre correcto: sale UNA persona, de frente, cerca'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: 12),
        ],
        if (foto != null && _consejosVisibles.isNotEmpty) ...[
          _Consejos(fallos: _consejosVisibles),
          const SizedBox(height: 12),
        ],
        if (foto != null && _fallos.isEmpty) ...[
          const _Nota(
            icono: Icons.check_circle_outline,
            pareja: Paleta.exitoSuave,
            texto: 'La foto sirve. Viajará con la visita.',
          ),
          const SizedBox(height: 12),
        ],
        if (_sinCamara) ...[
          const _Nota(
            icono: Icons.no_photography_outlined,
            pareja: Paleta.peligroSuave,
            texto: 'No se pudo abrir la cámara. Revise que la app tenga permiso para usarla.',
          ),
          const SizedBox(height: 12),
        ],
        OutlinedButton.icon(
          key: const Key('foto.tomar'),
          onPressed: activa ? _tomar : null,
          icon: _tomando
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.photo_camera_outlined),
          label: Text(foto == null ? 'Tomar la foto' : 'Repetir la foto'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
      ],
    );
  }
}

class _Consejos extends StatelessWidget {
  const _Consejos({required this.fallos});
  final List<FalloDeCalidad> fallos;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.avisoSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            fallos.length == 1 ? 'Repita la foto' : 'Repita la foto: hay ${fallos.length} cosas',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          // Todos los consejos a la vez. Uno por uno serían tres viajes.
          ...fallos.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '· ${consejoPara(f)}',
                style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Nota extends StatelessWidget {
  const _Nota({required this.icono, required this.pareja, required this.texto});
  final IconData icono;
  final Pareja pareja;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: pareja.fondo, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            Icon(icono, color: pareja.texto, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(texto, style: TextStyle(color: pareja.texto, fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}
