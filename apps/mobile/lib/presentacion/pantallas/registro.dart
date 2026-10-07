/// «Crear cuenta» con un código de invitación (RONDA 15-W).
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SEIS CAMPOS, LA POLÍTICA Y UN BOTÓN QUE NO RESPONDE ANTES DE TIEMPO
///
/// Usuario, correo, contraseña, su confirmación, el código de invitación y la
/// fecha de nacimiento (`widgets/campos_del_registro.dart`). El botón no
/// responde hasta que todo está escrito, las dos contraseñas coinciden y la
/// casilla de la política está marcada: es la única forma de que la versión
/// aceptada sea la que se leyó.
///
/// Lo que se valida en el teléfono es CORTESÍA. La verdad es la del servidor:
/// sus rechazos se pintan debajo del campo que nombran, y el del código es
/// SIEMPRE el mismo texto genérico que manda el servidor, sin pistas de qué
/// falló. Si la política cambió mientras se llenaba el formulario, el rechazo
/// trae la nueva: se muestra y la casilla se desmarca.
///
/// Creada la cuenta, la app entra sola con el prefijo del código como código
/// de la copropiedad, y quien abrió esta pantalla lleva al primer ingreso con
/// el correo escrito aquí ya propuesto.
/// ═════════════════════════════════════════════════════════════════════════════
library;

import 'package:flutter/material.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/acceso.dart';
import '../../dominio/puertos.dart';
import '../../dominio/registro.dart';
import '../widgets/campos_del_registro.dart';
import '../widgets/politica_de_datos.dart';
import 'campos_de_perfil.dart' show AvisoDeRechazo;

/// Abre «Crear cuenta». Devuelve el correo escrito si la cuenta se creó y la
/// sesión quedó abierta; `null` si el residente volvió sin crearla.
Future<String?> abrirRegistro(
  BuildContext context, {
  required ServicioDeRegistro servicio,
  required SesionEnUso sesion,
  required Reloj reloj,
}) => Navigator.of(context).push<String>(
  MaterialPageRoute(
    builder: (ruta) => PantallaDeRegistro(
      servicio: servicio,
      sesion: sesion,
      reloj: reloj,
      alEntrar: (correo) => Navigator.of(ruta).pop(correo),
    ),
  ),
);

class PantallaDeRegistro extends StatefulWidget {
  const PantallaDeRegistro({
    super.key,
    required this.servicio,
    required this.sesion,
    required this.reloj,
    required this.alEntrar,
  });

  final ServicioDeRegistro servicio;
  final SesionEnUso sesion;
  final Reloj reloj;

  /// Cuenta creada y sesión abierta, con el correo escrito.
  final void Function(String correo) alEntrar;

  @override
  State<PantallaDeRegistro> createState() => _EstadoDelRegistro();
}

class _EstadoDelRegistro extends State<PantallaDeRegistro> {
  final _formulario = GlobalKey<FormState>();
  final _c = ControlesDelRegistro();
  PoliticaDeDatos? _politica;
  Fallo? _falloDePolitica;
  String? _avisoDePolitica;
  bool _aceptada = false;
  bool _enviando = false;
  Map<String, String> _errores = const {};
  String? _rechazo;

  /// La cuenta ya existe y sólo falló la entrada: el formulario no se reenvía.
  String? _creadaSinEntrar;

  @override
  void initState() {
    super.initState();
    _cargarPolitica();
  }

  @override
  void dispose() {
    _c.liberar();
    super.dispose();
  }

  Future<void> _cargarPolitica() async {
    if (_falloDePolitica != null) setState(() => _falloDePolitica = null);
    try {
      final p = await widget.servicio.politicaVigente();
      if (mounted) setState(() => _politica = p);
    } on Fallo catch (f) {
      if (mounted) setState(() => _falloDePolitica = f);
    }
  }

  bool get _listo =>
      !_enviando &&
      _creadaSinEntrar == null &&
      registroListoParaEnviar(
        usuario: _c.usuario.text,
        correo: _c.correo.text,
        contrasena: _c.contrasena.text,
        confirmacion: _c.confirmacion.text,
        codigo: _c.codigo.text,
        fechaNacimiento: _c.fecha.text,
        aceptada: _aceptada,
        hayPolitica: _politica != null,
      );

  /// Si la vigente ya no es la que se mostró, se muestra la nueva y hay que
  /// volver a aceptarla.
  void _conPolitica(PoliticaDeDatos? vigente) {
    if (vigente == null || vigente.version == _politica?.version) return;
    _politica = vigente;
    _aceptada = false;
    _avisoDePolitica =
        'La política cambió mientras llenaba el formulario. Léala y acéptela de nuevo.';
  }

  Future<void> _crear() async {
    final politica = _politica;
    if (politica == null || !(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _errores = const {};
      _rechazo = null;
      _avisoDePolitica = null;
    });
    try {
      final r = await widget.servicio.registrar(
        SolicitudDeRegistro(
          usuario: _c.usuario.text,
          correo: _c.correo.text,
          contrasena: _c.contrasena.text,
          confirmacion: _c.confirmacion.text,
          codigoDeInvitacion: _c.codigo.text,
          fechaNacimiento: _c.fecha.text,
          versionPolitica: politica.version,
        ),
      );
      if (!mounted) return;
      switch (r) {
        case CuentaCreada():
          await _entrar();
        case RegistroConErrores(campos: final c, politica: final p):
          setState(() {
            _errores = c;
            _conPolitica(p);
          });
        case RegistroRechazado(mensaje: final m, politica: final p):
          setState(() {
            _rechazo = m;
            _conPolitica(p);
          });
      }
    } on Fallo catch (f) {
      if (mounted) setState(() => _rechazo = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  /// Entra con el prefijo del código (el código de la copropiedad) y el usuario.
  Future<void> _entrar() async {
    final codigo = copropiedadDelCodigo(_c.codigo.text) ?? '';
    try {
      await widget.sesion.iniciar(
        identificador: PorUsuario(codigo: codigo, usuario: normalizarUsuario(_c.usuario.text)),
        clave: _c.contrasena.text,
      );
      if (mounted) widget.alEntrar(_c.correo.text.trim());
    } on Fallo catch (f) {
      if (!mounted) return;
      setState(() {
        _creadaSinEntrar =
            'Su cuenta quedó creada, pero todavía no se pudo entrar. También puede entrar desde '
            'el acceso con el código $codigo, su usuario y su contraseña.\n\n${f.detalle}';
      });
    }
  }

  Future<void> _reintentarEntrada() async {
    setState(() => _enviando = true);
    await _entrar();
    if (mounted) setState(() => _enviando = false);
  }

  @override
  Widget build(BuildContext context) {
    final sinEntrar = _creadaSinEntrar;
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: SafeArea(
        child: Form(
          key: _formulario,
          onChanged: () => setState(() {}),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Necesita el código de invitación de una plaza de su vivienda. Las cuentas son '
                'para mayores de edad.',
              ),
              const SizedBox(height: 16),
              CamposDelRegistro(
                controles: _c,
                errores: _errores,
                hoy: widget.reloj.ahora(),
                alCambiar: () => setState(() {}),
              ),
              const SizedBox(height: 16),
              CasillaDePolitica(
                politica: _politica,
                fallo: _falloDePolitica,
                aceptada: _aceptada,
                aviso: _errores['versionPolitica'] ?? _avisoDePolitica,
                alCambiar: (v) => setState(() => _aceptada = v),
                alReintentar: _cargarPolitica,
              ),
              const SizedBox(height: 16),
              // Junto al botón: es donde se mira después de pulsarlo.
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              if (sinEntrar != null) ...[
                AvisoDeRechazo(sinEntrar),
                FilledButton(
                  key: const Key('registro.entrar'),
                  onPressed: _enviando ? null : _reintentarEntrada,
                  child: const Text('Intentar entrar'),
                ),
              ] else
                FilledButton(
                  key: const Key('registro.crear'),
                  onPressed: _listo ? _crear : null,
                  child: Text(_enviando ? 'Creando…' : 'Crear cuenta'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
