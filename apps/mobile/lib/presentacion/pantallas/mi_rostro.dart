/// «Mi rostro» (RONDA 15-X, D2, ADR-039): registrar, renovar y retirar el
/// rostro propio, con la política que manda el servidor. D3 · la MISMA pantalla
/// gestiona el de un menor del hogar (`TextosDelRostro.deMenor`): cambian los
/// textos y se añaden las dos declaraciones del representante legal.
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
import '../textos_del_rostro.dart';
import '../widgets/avisos_de_la_foto.dart';
import '../widgets/captura_de_rostro.dart';
import '../widgets/estado_del_rostro.dart';

/// Lo que se dice si el envío no encontró red.
const avisoSinConexionDelRostro =
    'Sin conexión: su foto no se guardó en el teléfono. Tómela de nuevo cuando tenga '
    'conexión.';

class PantallaDeMiRostro extends StatefulWidget {
  const PantallaDeMiRostro({
    super.key,
    required this.rostro,
    required this.tomarFoto,
    this.textos = const TextosDelRostro.propio(),
  });

  final RostroDelResidente rostro;
  final TomarFoto tomarFoto;

  /// D3 · el propio, o el de un menor del hogar con sus dos declaraciones.
  final TextosDelRostro textos;

  @override
  State<PantallaDeMiRostro> createState() => _EstadoDeMiRostro();
}

class _EstadoDeMiRostro extends State<PantallaDeMiRostro> {
  EstadoDeMiRostro? _estado;
  Fallo? _falloDeCarga;
  FotoDeRostro? _foto;
  bool _acepta = false;
  late List<bool> _declarado = _sinDeclarar();
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

  List<bool> _sinDeclarar() => List.filled(widget.textos.declaraciones.length, false);

  void _descartarFoto() {
    _foto = null;
    _acepta = false;
    _declarado = _sinDeclarar();
    _intento += 1;
  }

  /// La foto que sirve, la política y, para un menor, las dos declaraciones.
  bool get _listo => _foto != null && _acepta && _declarado.every((d) => d);

  Future<void> _registrar(PoliticaDelRostro politica) async {
    final foto = _foto;
    if (foto == null || !_listo) return;
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
      appBar: AppBar(title: Text(widget.textos.titulo)),
      body: SafeArea(
        child: e == null
            ? Center(
                child: f == null
                    ? const CircularProgressIndicator()
                    : SinCargarElRostro(fallo: f, alReintentar: _cargar),
              )
            : ListView(padding: const EdgeInsets.all(16), children: _contenido(e)),
      ),
    );
  }

  List<Widget> _contenido(EstadoDeMiRostro e) {
    final politica = e.politica;
    final aviso = _aviso;
    final t = widget.textos;
    return [
      TarjetaDelEstadoDelRostro(estado: e),
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
        titulo: e.tieneRostro ? t.renovar : t.registrar,
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
        _Casilla(
          clave: 'rostro.acepto',
          valor: _acepta,
          texto: t.acepto,
          alCambiar: _ocupado ? null : (v) => setState(() => _acepta = v),
        ),
        for (final (i, declaracion) in t.declaraciones.indexed)
          _Casilla(
            clave: 'rostro.declaracion.$i',
            valor: _declarado[i],
            texto: declaracion,
            alCambiar: _ocupado ? null : (v) => setState(() => _declarado[i] = v),
          ),
        FilledButton(
          key: const Key('rostro.registrar'),
          onPressed: _listo && !_ocupado ? () => _registrar(politica) : null,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          child: Text(e.tieneRostro ? t.renovar : t.registrar),
        ),
      ],
      if (e.tieneRostro) ...[
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('rostro.retirar'),
          onPressed: _ocupado ? null : _retirar,
          icon: const Icon(Icons.delete_outline),
          label: Text(t.retirar),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: Paleta.peligroSuave.texto,
          ),
        ),
      ],
    ];
  }
}

class _Casilla extends StatelessWidget {
  const _Casilla({
    required this.clave,
    required this.valor,
    required this.texto,
    required this.alCambiar,
  });
  final String clave;
  final bool valor;
  final String texto;
  final void Function(bool)? alCambiar;

  @override
  Widget build(BuildContext context) {
    final cambiar = alCambiar;
    return CheckboxListTile(
      key: Key(clave),
      value: valor,
      onChanged: cambiar == null ? null : (v) => cambiar(v ?? false),
      title: Text(texto),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
    );
  }
}
