/// La puerta del primer ingreso (3.2): hasta completarlo, no se ve ninguna otra
/// pantalla.
///
/// Qué pantalla toca lo decide `pasoDePrimerIngreso` (dominio, puro): el cambio
/// de contraseña pendiente que viaja en el token, si hay vivienda vinculada, si
/// la cuenta al menos trae una asignada (15-W) y si el titular aún no declaró
/// sus ocupantes. Esta pieza sólo pide a la API lo que falta saber y monta la
/// pantalla del paso.
///
/// 15-X (D2) · antes de la app se le ofrece su rostro mientras no lo tenga y no
/// haya dicho «Ahora no» (`OfertaDelRostro`); lo tiene siempre en «Mi perfil →
/// Mi rostro». Sin red no se ofrece: nunca bloquea.
///
/// 15-W · una cuenta sin vivienda asignada no tiene formulario que llenar: ve
/// el aviso del servidor («La administración debe asignarle su vivienda») y
/// puede volver a consultar. El correo escrito en «Crear cuenta», si se acaba
/// de crear, llega propuesto al formulario: vive sólo en memoria.
///
/// La puerta NO es la barrera: la barrera es el servidor, que responde 403 a
/// una cuenta con el cambio pendiente y 404 a una sin vivienda. La puerta evita
/// que el residente vea esas respuestas como errores.
library;

export '../../aplicacion/oferta_del_rostro.dart' show OfertaDelRostro;

import 'package:flutter/material.dart';

import '../../aplicacion/oferta_del_rostro.dart';
import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/acceso.dart';
import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'alta.dart';
import 'cambio_de_contrasena.dart';
import 'declarar_ocupantes.dart';
import 'ofrecer_rostro.dart';
import '../widgets/esperas_del_ingreso.dart';

class PuertaDePrimerIngreso extends StatefulWidget {
  const PuertaDePrimerIngreso({
    super.key,
    required this.sesion,
    required this.alta,
    required this.cuenta,
    required this.alTerminar,
    required this.alSalir,
    this.recuperada = false,
    this.reloj = const RelojDelSistema(),
    this.correoDeContacto,
    this.oferta,
    this.tomarFoto,
  });

  final SesionEnUso sesion;
  final RepositorioDeAlta alta;
  final ServicioDeCuenta cuenta;
  final void Function() alTerminar;
  final void Function() alSalir;

  /// El de la app: la fecha de nacimiento se juzga con él.
  final Reloj reloj;

  /// 15-W · el correo escrito en «Crear cuenta», si se acaba de crear.
  final String? correoDeContacto;

  /// 15-X · sin las dos no se ofrece el rostro (pruebas de otras pantallas).
  final OfertaDelRostro? oferta;
  final TomarFoto? tomarFoto;

  /// La sesión se recuperó del llavero al arrancar, en vez de abrirse ahora.
  /// `[SUPUESTO]` S-59 · sin red al arrancar con una sesión así, se deja pasar
  /// a la app —que pinta su estado sin conexión— en vez de bloquearla: el
  /// servidor sigue imponiendo el alta en cuanto haya red.
  final bool recuperada;

  @override
  State<PuertaDePrimerIngreso> createState() => _EstadoDeLaPuerta();
}

class _EstadoDeLaPuerta extends State<PuertaDePrimerIngreso> {
  EstadoDeAlta? _estado;
  Fallo? _fallo;
  bool _consultando = false;

  /// 15-X · `null` mientras no se sabe si se ofrece el rostro (se pregunta al
  /// llegar al final); `false` si no, o si ya se respondió.
  bool? _ofrecer;

  bool get _debeCambiar => widget.sesion.sesion?.debeCambiarContrasena ?? false;

  PasoDePrimerIngreso get _paso => pasoDePrimerIngreso(
    debeCambiarContrasena: _debeCambiar,
    viviendaVinculada: _estado?.viviendaVinculada,
    viviendaAsignada: _estado?.viviendaAsignada ?? true,
    debeDeclararOcupantes: _estado?.debeDeclararOcupantes ?? false,
    ofrecerRostro: _ofrecer ?? false,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _avanzar());
  }

  /// Consulta lo que falta, o termina si ya no falta nada.
  Future<void> _avanzar() async {
    if (!mounted) return;
    switch (_paso) {
      case PasoDePrimerIngreso.listo:
        final (oferta, foto) = (widget.oferta, widget.tomarFoto);
        if (_ofrecer != null || oferta == null || foto == null) return widget.alTerminar();
        final ofrecer = await oferta.seOfrece(_cuenta);
        if (!mounted) return;
        setState(() => _ofrecer = ofrecer);
        await _avanzar();
      case PasoDePrimerIngreso.consultarAlta:
        await _consultar();
      case PasoDePrimerIngreso.cambiarContrasena:
      case PasoDePrimerIngreso.esperarVivienda:
      case PasoDePrimerIngreso.completarAlta:
      case PasoDePrimerIngreso.declararOcupantes:
      case PasoDePrimerIngreso.ofrecerRostro:
        setState(() {});
    }
  }

  String get _cuenta => widget.sesion.sesion?.usuarioId ?? '';

  /// 15-X · respondida la invitación —con su rostro o sin él—, se sigue; un
  /// «Ahora no» se recuerda para esta cuenta.
  Future<void> _trasOfrecer({required bool ahoraNo}) async {
    if (ahoraNo) await widget.oferta?.ahoraNo(_cuenta);
    if (!mounted) return;
    setState(() => _ofrecer = false);
    await _avanzar();
  }

  Future<void> _consultar() async {
    setState(() {
      _consultando = true;
      _fallo = null;
    });
    try {
      final e = await widget.alta.miAlta();
      if (!mounted) return;
      setState(() => _estado = e);
      await _avanzar();
    } on Fallo catch (f) {
      if (!mounted) return;
      if (f.clase == ClaseDeFallo.sinConexion && widget.recuperada) {
        widget.alTerminar();
        return;
      }
      if (f.clase == ClaseDeFallo.sesionInvalida) {
        widget.alSalir();
        return;
      }
      setState(() => _fallo = f);
    } finally {
      if (mounted) setState(() => _consultando = false);
    }
  }

  Future<void> _trasCambiar() async {
    // ADR-023 · el token vigente aún lleva el indicador: se renueva.
    final renovada = await widget.sesion.renovarTrasCambio();
    if (!mounted) return;
    if (renovada == null) {
      widget.alSalir();
      return;
    }
    await _avanzar();
  }

  @override
  Widget build(BuildContext context) {
    final estado = _estado;
    switch (_paso) {
      case PasoDePrimerIngreso.cambiarContrasena:
        return PantallaDeCambioDeContrasena(
          servicio: widget.cuenta,
          alCambiar: _trasCambiar,
          alSalir: widget.alSalir,
        );
      case PasoDePrimerIngreso.esperarVivienda when estado != null && !_consultando:
        return SinViviendaAsignada(
          aviso: estado.aviso ?? avisoSinVivienda,
          alConsultar: _consultar,
          alSalir: widget.alSalir,
        );
      case PasoDePrimerIngreso.completarAlta when estado != null:
        return PantallaDeAlta(
          estado: estado,
          repositorio: widget.alta,
          hoy: widget.reloj.ahora(),
          correoDeContacto: widget.correoDeContacto,
          alSalir: widget.alSalir,
          alCompletar: () {
            setState(() => _estado = null);
            _consultar();
          },
        );
      case PasoDePrimerIngreso.declararOcupantes when estado != null:
        return PantallaDeDeclararOcupantes(
          aviso: estado.avisoOcupantes,
          repositorio: widget.alta,
          alSalir: widget.alSalir,
          alDeclarar: (_) {
            setState(() => _estado = null);
            _consultar();
          },
        );
      case PasoDePrimerIngreso.ofrecerRostro:
        final (oferta, foto) = (widget.oferta, widget.tomarFoto);
        if (oferta == null || foto == null) break;
        return PantallaDeOfrecerRostro(
          rostro: oferta.rostro,
          tomarFoto: foto,
          alSeguir: _trasOfrecer,
        );
      default:
        break;
    }
    return ConsultandoElIngreso(
      consultando: _consultando,
      fallo: _fallo,
      alReintentar: _consultar,
      alSalir: widget.alSalir,
    );
  }
}
