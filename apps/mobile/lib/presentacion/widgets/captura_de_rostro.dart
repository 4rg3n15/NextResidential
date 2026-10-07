/// La foto frontal de una PERSONA para los equipos de reconocimiento facial:
/// tomarla o elegirla de la galería, juzgarla y decir por qué repetirla.
///
/// 15-X · salió de `FotoDelVisitante` cuando el residente empezó a registrar
/// su PROPIO rostro (D2) y el del menor a su cargo (D3): la misma foto, los
/// mismos umbrales y los mismos consejos, con otro título. La copia número dos
/// es la que se queda con el umbral viejo; por eso se extrajo, no se copió.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL WIDGET NO ENVÍA NADA
///
/// Avisa hacia arriba con la foto QUE SIRVE —con las medidas que viajarán— o
/// con `null` mientras no haya una, y quien lo usa decide con eso si su botón
/// se habilita.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA CALIDAD SE JUZGA AQUÍ ANTES DE ENVIAR, Y ALLÍ TAMBIÉN
///
/// Aquí porque quien captura tiene delante a la persona y puede repetir la
/// foto en ese momento (CA-08); allí porque ésta se salta con un cliente
/// modificado (KPI-16). No es duplicación: son dos destinatarios. Y se enseñan
/// TODOS los fallos, no el primero: tres intentos para lo que se arregla en uno.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SIN DETECTOR DE ROSTROS, EL ENCUADRE SE CONFIRMA; NO SE INVENTA
///
/// La cámara del sistema no cuenta rostros. El conteo y la proporción los
/// sustituye un BOTÓN sobre la foto —«sale una persona, de frente, cerca»—,
/// igual que en la consola. Mientras no se pulse, la foto no sirve.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// DOS BOTONES, UN SOLO JUICIO
///
/// «Tomar foto» y «Elegir de la galería» piden al mismo puerto con distinto
/// origen, y lo que vuelve se juzga igual venga de donde venga. Cancelar no
/// cambia nada; lo que no es cancelar —un archivo que no se lee, un permiso
/// negado— se dice con su salida.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/calidad_de_captura.dart';
import '../../dominio/entidades.dart';
import '../../dominio/medidas_de_imagen.dart';
import '../../dominio/origen_de_la_foto.dart';
import '../../dominio/puertos.dart';
import 'avisos_de_la_foto.dart';

class CapturaDeRostro extends StatefulWidget {
  const CapturaDeRostro({
    super.key,
    required this.tomarFoto,
    required this.alCambiar,
    required this.titulo,
    required this.indicacion,
    required this.textoSiSirve,
    this.habilitada = true,
  });

  final TomarFoto tomarFoto;

  /// La foto que sirve, lista para viajar, o `null` si todavía no hay una.
  final ValueChanged<FotoDeVisita?> alCambiar;

  /// «Foto del visitante», «Foto de su rostro»…
  final String titulo;

  /// Cómo tomarla y para qué sirve, en una frase.
  final String indicacion;

  /// Lo que se dice cuando la foto sirve: adónde va.
  final String textoSiSirve;

  /// `false` mientras se envía: cambiar la foto a medio envío dejaría a quien
  /// captura sin saber cuál viajó.
  final bool habilitada;

  @override
  State<CapturaDeRostro> createState() => _EstadoDeLaCaptura();
}

class _EstadoDeLaCaptura extends State<CapturaDeRostro> {
  FotoTomada? _foto;
  bool _encuadreConfirmado = false;
  List<FalloDeCalidad> _fallos = const [];

  /// El origen cuyo selector está abierto, o `null`. Con uno abierto, los dos
  /// botones esperan: dos selectores a la vez el sistema no los admite.
  OrigenDeFoto? _abriendo;

  /// Por qué no llegó la foto que se pidió, en palabras. `null` si llegó o se
  /// canceló.
  String? _aviso;

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

  Future<void> _obtener(OrigenDeFoto origen) async {
    setState(() {
      _abriendo = origen;
      _aviso = null;
    });
    try {
      final foto = await widget.tomarFoto(origen);
      // Cancelar la cámara o la galería no borra la foto que ya servía.
      if (!mounted || foto == null) return;
      setState(() {
        _foto = foto;
        _encuadreConfirmado = false;
        // El juicio del dominio, no un `if` aquí: los umbrales viven en un
        // sitio, y son los mismos para la cámara y para la galería.
        _fallos = evaluarCaptura(foto.medidas);
      });
      _avisar();
    } on FotoNoObtenida catch (e) {
      // [SUPUESTO] S-98 · Un archivo ilegible tampoco borra la foto que ya servía:
      // se trata como cancelar, más el aviso. Sin foto previa, sigue vacía.
      if (mounted) setState(() => _aviso = avisoSinFoto(e.motivo, origen));
    } on Exception {
      // Algo que el adaptador no supo nombrar: el residente tiene que
      // saberlo, no quedarse mirando un botón que no hizo nada.
      if (mounted) setState(() => _aviso = avisoSinFoto(MotivoSinFoto.noSeAbrio, origen));
    } finally {
      if (mounted) setState(() => _abriendo = null);
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
    final activa = widget.habilitada && _abriendo == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.titulo, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(widget.indicacion, style: const TextStyle(color: Paleta.textoSuave, fontSize: 13)),
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
          ConsejosDeLaFoto(fallos: _consejosVisibles),
          const SizedBox(height: 12),
        ],
        if (foto != null && _fallos.isEmpty) ...[
          NotaDeLaFoto(
            icono: Icons.check_circle_outline,
            pareja: Paleta.exitoSuave,
            texto: widget.textoSiSirve,
          ),
          const SizedBox(height: 12),
        ],
        if (_aviso != null) ...[
          NotaDeLaFoto(
            key: const Key('foto.aviso'),
            icono: Icons.no_photography_outlined,
            pareja: Paleta.peligroSuave,
            texto: _aviso!,
          ),
          const SizedBox(height: 12),
        ],
        // Los mismos dos textos antes y después de tener foto: con una foto
        // que no sirve, lo que se busca es otra, venga de donde venga.
        BotonDeLaFoto(
          key: const Key('foto.tomar'),
          icono: Icons.photo_camera_outlined,
          texto: 'Tomar foto',
          ocupado: _abriendo == OrigenDeFoto.camara,
          alPulsar: activa ? () => _obtener(OrigenDeFoto.camara) : null,
        ),
        const SizedBox(height: 8),
        BotonDeLaFoto(
          key: const Key('foto.galeria'),
          icono: Icons.photo_library_outlined,
          texto: 'Elegir de la galería',
          ocupado: _abriendo == OrigenDeFoto.galeria,
          alPulsar: activa ? () => _obtener(OrigenDeFoto.galeria) : null,
        ),
      ],
    );
  }
}
