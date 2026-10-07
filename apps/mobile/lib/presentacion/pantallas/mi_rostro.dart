/// «Mi rostro» (RONDA 15-X, D2, ADR-039): registrar, renovar y retirar el
/// rostro propio, con la política que manda el servidor.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// QUÉ SE VE Y QUÉ NO
///
///  · El ESTADO —sin rostro, enviándose, activo, en algunos equipos, por
///    vencer, retirándose—, la calidad, las fechas y cada equipo. Nunca la
///    imagen: el servidor no la devuelve y aquí no hay dónde ponerla.
///  · La POLÍTICA tal cual la mandó el servidor, con su versión: es la que se
///    acepta, y la que viaja. Si cambió entre medias, el servidor contesta 409
///    y la pantalla vuelve a leerla.
///  · Sin la casilla marcada y sin una foto que sirva, el botón no se habilita;
///    el servidor lo exige igual.
///
/// SIN CONEXIÓN NO SE GUARDA NADA: la foto no entra en la bandeja de salida
/// —un rostro esperando en el teléfono es lo que la ley pide no tener—, se
/// descarta y se dice. La cámara ya borró su copia temporal al leerla.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';
import '../../dominio/rostro.dart';
import '../widgets/avisos_de_la_foto.dart';
import '../widgets/captura_de_rostro.dart';
import 'comunes.dart';

/// Lo que se dice si el envío no encontró red.
const avisoSinConexionDelRostro =
    'Sin conexión: su foto no se guardó en el teléfono. Tómela de nuevo cuando tenga '
    'conexión.';

class PantallaDeMiRostro extends StatefulWidget {
  const PantallaDeMiRostro({super.key, required this.rostro, required this.tomarFoto});

  final RostroDelResidente rostro;
  final TomarFoto tomarFoto;

  @override
  State<PantallaDeMiRostro> createState() => _EstadoDeMiRostro();
}

class _EstadoDeMiRostro extends State<PantallaDeMiRostro> {
  EstadoDeMiRostro? _estado;
  Fallo? _falloDeCarga;
  FotoDeRostro? _foto;
  bool _acepta = false;
  bool _ocupado = false;

  /// Lo último que pasó, en una frase: lo bueno en verde, lo malo en rojo.
  ({String texto, bool bien})? _aviso;

  /// Cambia para montar una captura nueva: así una foto descartada no se queda
  /// en pantalla ni en memoria.
  int _intento = 0;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _falloDeCarga = null);
    try {
      final e = await widget.rostro.miRostro();
      if (mounted) setState(() => _estado = e);
    } on Fallo catch (f) {
      if (mounted) setState(() => _falloDeCarga = f);
    }
  }

  void _descartarFoto() {
    _foto = null;
    _acepta = false;
    _intento += 1;
  }

  Future<void> _registrar(PoliticaDelRostro politica) async {
    final foto = _foto;
    if (foto == null || !_acepta) return;
    setState(() {
      _ocupado = true;
      _aviso = null;
    });
    try {
      final e = await widget.rostro.registrar(foto, versionPolitica: politica.version);
      if (!mounted) return;
      setState(() {
        _estado = e.conPolitica(politica);
        _descartarFoto();
        _aviso = (texto: 'Listo: su rostro quedó registrado.', bien: true);
      });
    } on Fallo catch (f) {
      if (!mounted) return;
      final sinRed = f.clase == ClaseDeFallo.sinConexion;
      setState(() {
        if (sinRed) _descartarFoto();
        _aviso = (texto: sinRed ? avisoSinConexionDelRostro : f.detalle, bien: false);
      });
      // Un 409 (la política cambió u otro registro ganó): se relee el estado.
      if (f.clase == ClaseDeFallo.servidor) await _cargar();
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _retirar() async {
    final seguro = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('¿Retirar su rostro?'),
        content: const Text(
          'Se borra de inmediato, también de los equipos de la portería. Podrá registrarlo de '
          'nuevo cuando quiera.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
          FilledButton(
            key: const Key('rostro.confirmarRetiro'),
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Retirar'),
          ),
        ],
      ),
    );
    if (seguro != true || !mounted) return;
    setState(() {
      _ocupado = true;
      _aviso = null;
    });
    try {
      final e = await widget.rostro.retirar();
      if (!mounted) return;
      setState(() {
        _estado = e.conPolitica(_estado?.politica);
        _aviso = (texto: 'Su rostro se retiró.', bien: true);
      });
    } on Fallo catch (f) {
      if (mounted) setState(() => _aviso = (texto: f.detalle, bien: false));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _estado;
    final f = _falloDeCarga;
    return Scaffold(
      appBar: AppBar(title: const Text('Mi rostro')),
      body: SafeArea(
        child: e == null
            ? Center(
                child: f == null
                    ? const CircularProgressIndicator()
                    : _SinCargar(fallo: f, alReintentar: _cargar),
              )
            : ListView(padding: const EdgeInsets.all(16), children: _contenido(e)),
      ),
    );
  }

  List<Widget> _contenido(EstadoDeMiRostro e) {
    final politica = e.politica;
    final aviso = _aviso;
    return [
      _TarjetaDelEstado(estado: e),
      if (aviso != null) ...[
        const SizedBox(height: 12),
        NotaDeLaFoto(
          key: const Key('rostro.aviso'),
          icono: aviso.bien ? Icons.check_circle_outline : Icons.error_outline,
          pareja: aviso.bien ? Paleta.exitoSuave : Paleta.peligroSuave,
          texto: aviso.texto,
        ),
      ],
      const SizedBox(height: 20),
      CapturaDeRostro(
        key: ValueKey('rostro.captura.$_intento'),
        tomarFoto: widget.tomarFoto,
        alCambiar: (foto) => setState(() => _foto = foto),
        habilitada: !_ocupado,
        titulo: e.tieneRostro ? 'Renovar mi rostro' : 'Registrar mi rostro',
        indicacion:
            'De frente, con buena luz y sin nadie más en la imagen: es la foto con la que la '
            'terminal de la portería lo reconocerá.',
        textoSiSirve: 'La foto sirve.',
      ),
      if (politica != null) ...[
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(politica.texto, key: const Key('rostro.politica')),
          ),
        ),
        CheckboxListTile(
          key: const Key('rostro.acepto'),
          value: _acepta,
          onChanged: _ocupado ? null : (v) => setState(() => _acepta = v ?? false),
          title: const Text('Leí y acepto la política del tratamiento de mi rostro'),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
        ),
        FilledButton(
          key: const Key('rostro.registrar'),
          onPressed: _foto != null && _acepta && !_ocupado ? () => _registrar(politica) : null,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          child: Text(e.tieneRostro ? 'Renovar mi rostro' : 'Registrar mi rostro'),
        ),
      ],
      if (e.tieneRostro) ...[
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('rostro.retirar'),
          onPressed: _ocupado ? null : _retirar,
          icon: const Icon(Icons.delete_outline),
          label: const Text('Retirar mi rostro'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: Paleta.peligroSuave.texto,
          ),
        ),
      ],
    ];
  }
}

class _TarjetaDelEstado extends StatelessWidget {
  const _TarjetaDelEstado({required this.estado});
  final EstadoDeMiRostro estado;

  @override
  Widget build(BuildContext context) {
    final e = estado;
    final registrado = e.registradoEn;
    final vence = e.venceEn;
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            leading: Icon(e.tieneRostro ? Icons.face_retouching_natural : Icons.face_outlined),
            title: Text(textoDelEstado(e), key: const Key('rostro.estado')),
            subtitle: registrado == null || vence == null
                ? null
                : Text('Registrado el ${fechaCorta(registrado)} · vence el ${fechaCorta(vence)}'),
          ),
          for (final q in e.equipos)
            ListTile(
              dense: true,
              leading: const Icon(Icons.door_front_door_outlined, size: 20),
              title: Text(q.nombre),
              trailing: Text(textoDelEquipo(q.estado)),
            ),
        ],
      ),
    );
  }
}

class _SinCargar extends StatelessWidget {
  const _SinCargar({required this.fallo, required this.alReintentar});
  final Fallo fallo;
  final Future<void> Function() alReintentar;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.cloud_off_outlined, size: 48),
        const SizedBox(height: 12),
        Text(fallo.detalle, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton(onPressed: alReintentar, child: const Text('Reintentar')),
      ],
    ),
  );
}
