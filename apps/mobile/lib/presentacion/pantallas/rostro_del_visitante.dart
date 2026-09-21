/// HU-12 · HU-13 · CU-02 · La foto del visitante, y de quién es el permiso.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA PANTALLA ESTÁ ESCRITA PARA QUE NO SE PUEDA CONFUNDIR QUIÉN CONSIENTE
///
/// Quien sostiene el teléfono es el residente. Quien es dueño del dato es el
/// visitante (RN-10). Son dos personas y la pantalla no las mezcla:
///
///   · **No hay casilla de «acepto»**, ni para el residente ni para nadie. Una
///     casilla aquí sería la firma de otro en un papel; el consentimiento se
///     otorga por su propio canal y con su propia identidad, y el agregado del
///     servidor lo verifica.
///   · El desenlace bueno **no dice «listo»**: dice a quién se le pidió y que
///     está pendiente. Un «listo» haría que el residente le dijera a su
///     visitante que entre por la terminal facial, y no funcionaría.
///   · Se dice en voz alta que **sin respuesta no se sincroniza** (RN-09), que
///     es la consecuencia práctica de todo lo anterior.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA CALIDAD SE JUZGA AQUÍ ANTES DE ENVIAR, Y ALLÍ TAMBIÉN
///
/// Aquí porque el residente tiene delante a la persona y puede repetir la foto
/// en ese momento (CA-08); una validación que solo ocurriera en el servidor
/// llegaría cuando el visitante ya se fue. Allí porque esta se salta con un
/// cliente modificado (KPI-16). No es duplicación: son dos destinatarios.
///
/// Y se enseñan TODOS los fallos, no el primero: corregir la luz para que le
/// digan que está movida, y sostenerlo quieto para que le digan que se acerque,
/// son tres intentos para lo que se arregla en uno.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/calidad_de_captura.dart';
import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';

/// De dónde sale la foto y sus medidas. Es un puerto por lo de siempre: sin él
/// esta pantalla no se podría probar sin una cámara, y con él se prueban las
/// siete formas de salir mal sin sacar una sola foto.
typedef TomarFoto = Future<FotoTomada?> Function();

class FotoTomada {
  const FotoTomada({required this.vector, required this.medidas, this.vistaPrevia});

  /// La plantilla derivada. **Nunca la foto original**: lo que viaja y lo que
  /// se guarda es el vector, y ni siquiera eso se queda en el teléfono.
  final Uint8List vector;
  final MedidasDeCaptura medidas;

  /// Miniatura para que el residente vea qué salió. Vive en memoria y muere
  /// con la pantalla.
  final Uint8List? vistaPrevia;
}

typedef EnviarRostro = Future<ResultadoDeCaptura> Function(FotoTomada foto);

class PantallaDeRostroDelVisitante extends StatefulWidget {
  const PantallaDeRostroDelVisitante({
    super.key,
    required this.nombreDelVisitante,
    required this.tomarFoto,
    required this.enviar,
    required this.versionPolitica,
  });

  /// Se enseña en todas partes: es de ESTA persona de quien se habla.
  final String nombreDelVisitante;
  final TomarFoto tomarFoto;
  final EnviarRostro enviar;

  /// La versión de la política de tratamiento que se le mostró al titular.
  /// Queda escrita en el consentimiento para la auditoría de la Ley 1581.
  final String versionPolitica;

  @override
  State<PantallaDeRostroDelVisitante> createState() => _PantallaDeRostroDelVisitanteState();
}

class _PantallaDeRostroDelVisitanteState extends State<PantallaDeRostroDelVisitante> {
  FotoTomada? _foto;
  List<FalloDeCalidad> _fallos = const [];
  bool _enviando = false;
  ResultadoDeCaptura? _desenlace;
  String? _error;

  Future<void> _tomar() async {
    setState(() {
      _error = null;
      _desenlace = null;
    });
    final foto = await widget.tomarFoto();
    if (!mounted || foto == null) return;
    setState(() {
      _foto = foto;
      // El juicio del dominio, no un `if` aquí: los umbrales viven en un sitio.
      _fallos = evaluarCaptura(foto.medidas);
    });
  }

  Future<void> _enviar() async {
    final foto = _foto;
    // La guarda no es cosmética: el botón se deshabilita, pero una pantalla que
    // permita enviar una foto que ella misma rechazó deja la validación en
    // manos de un estado de interfaz.
    if (foto == null || _fallos.isNotEmpty) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final r = await widget.enviar(foto);
      if (!mounted) return;
      setState(() => _desenlace = r);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e is Fallo ? e.detalle : 'No se pudo enviar la foto.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final desenlace = _desenlace;
    final puedeEnviar = _foto != null && _fallos.isEmpty && !_enviando;

    return Scaffold(
      appBar: AppBar(title: const Text('Foto del visitante')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text('Rostro de ${widget.nombreDelVisitante}', style: t.textTheme.titleMedium),
          const SizedBox(height: 8),
          const _DeQuienEsElPermiso(),
          const SizedBox(height: 16),

          if (_foto?.vistaPrevia != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(_foto!.vistaPrevia!, height: 220, fit: BoxFit.cover),
            ),
            const SizedBox(height: 12),
          ],

          if (_foto != null && _fallos.isNotEmpty) ...[
            _Consejos(fallos: _fallos),
            const SizedBox(height: 12),
          ],
          if (_foto != null && _fallos.isEmpty && desenlace == null) ...[
            _Aviso(
              icono: Icons.check_circle_outline,
              pareja: Paleta.exitoSuave,
              titulo: 'La foto sirve',
              cuerpo: 'Ahora falta lo importante: pedirle el permiso a '
                  '${widget.nombreDelVisitante}.',
            ),
            const SizedBox(height: 12),
          ],

          OutlinedButton.icon(
            onPressed: _enviando ? null : _tomar,
            icon: const Icon(Icons.photo_camera_outlined),
            label: Text(_foto == null ? 'Tomar la foto' : 'Repetir la foto'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: puedeEnviar ? _enviar : null,
            icon: _enviando
                ? const SizedBox(
                    height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send_outlined),
            label: Text(_enviando ? 'Enviando…' : 'Pedirle el permiso'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            _Aviso(
              icono: Icons.error_outline,
              pareja: Paleta.peligroSuave,
              titulo: 'No se pudo enviar',
              cuerpo: _error!,
            ),
          ],

          if (desenlace != null) ...[
            const SizedBox(height: 16),
            switch (desenlace) {
              CapturaAceptada(titular: final titular) => _Aviso(
                  icono: Icons.hourglass_top_outlined,
                  pareja: Paleta.avisoSuave,
                  // NO dice «listo». Decirlo haría que el residente mandara a su
                  // visitante a una terminal que todavía no lo conoce.
                  titulo: 'Pendiente de que $titular acepte',
                  cuerpo: 'La solicitud le llegará a $titular, que es quien decide. '
                      'Usted no puede aceptar por él. Hasta que acepte, la foto NO se '
                      'envía a ninguna terminal del conjunto.',
                ),
              CapturaRechazada(motivos: final motivos) => _Aviso(
                  icono: Icons.no_photography_outlined,
                  pareja: Paleta.peligroSuave,
                  titulo: 'El conjunto no aceptó la foto',
                  cuerpo: 'Repítala. Motivos: ${motivos.join(', ')}.',
                ),
            },
          ],
        ],
      ),
    );
  }
}

/// El párrafo que hace entendible todo lo demás. Va ARRIBA, antes de la foto:
/// leerlo después de haber fotografiado a alguien no sirve de nada.
class _DeQuienEsElPermiso extends StatelessWidget {
  const _DeQuienEsElPermiso();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.neutroSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'El rostro es un dato personal de su visitante, no suyo. Usted toma la foto; el '
        'permiso se lo pedimos a él y solo él puede darlo o retirarlo (Ley 1581 de 2012). '
        'Mientras no lo dé, la foto no se envía a ninguna terminal.',
        style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 13),
      ),
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

class _Aviso extends StatelessWidget {
  const _Aviso({
    required this.icono,
    required this.pareja,
    required this.titulo,
    required this.cuerpo,
  });

  final IconData icono;
  final Pareja pareja;
  final String titulo;
  final String cuerpo;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: pareja.fondo,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icono, color: pareja.texto, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: TextStyle(color: pareja.texto, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(cuerpo, style: TextStyle(color: pareja.texto, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
