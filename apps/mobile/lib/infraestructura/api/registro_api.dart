/// «Crear cuenta» contra la API (RONDA 15-W): `POST /auth/registro`.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA POLÍTICA LLEGA EN EL RECHAZO
///
/// La única ruta pública nueva es la del registro, así que el texto de la
/// política de tratamiento de datos no tiene una `GET` propia: viaja en TODO
/// 400 de esa ruta. La app lo pide al abrir la pantalla enviando el formulario
/// VACÍO por el cliente generado —el servidor lo rechaza por su forma, antes de
/// mirar ningún código, y con el rechazo manda `{version, texto}`—. Si al
/// enviar la versión mostrada ya no es la vigente, el mismo 400 trae la nueva.
///
/// Ninguna respuesta del registro trae sesión: se entra después por el acceso
/// de siempre. Y el código equivocado tiene UNA respuesta del servidor, que se
/// pasa tal cual: aquí no se distingue nada que el servidor no distinga.
/// ═════════════════════════════════════════════════════════════════════════════
library;

import 'package:dio/dio.dart';

import '../../dominio/puertos.dart';
import '../../dominio/registro.dart';
import 'cuerpo_de_error.dart';
import 'generado/clients/cuentas_api.dart';
import 'generado/models/registro_de_residente_dto.dart';
import 'soporte_de_api.dart';

class RegistroPorApi implements ServicioDeRegistro {
  RegistroPorApi({required CuentasApi api}) : _api = api;
  final CuentasApi _api;

  /// El formulario sin llenar: la forma que el servidor rechaza siempre, sin
  /// llegar a juzgar un código ni a contar un intento contra un conjunto.
  static const _formularioVacio = RegistroDeResidenteDto(
    usuario: '',
    correo: '',
    contrasena: '',
    confirmacion: '',
    codigoDeInvitacion: '',
    fechaNacimiento: '',
    aceptaTratamientoDeDatos: false,
    versionPolitica: '',
  );

  @override
  Future<PoliticaDeDatos> politicaVigente() async {
    try {
      await _api.registroControllerRegistro(body: _formularioVacio);
    } on DioException catch (e) {
      final politica = politicaDelRechazo(e.response?.data);
      if (politica != null) return politica;
      throw falloDeDio(e);
    }
    // Un formulario vacío aceptado no debería existir: sin política no hay
    // nada que aceptar, y el botón sigue deshabilitado.
    throw const Fallo(
      ClaseDeFallo.servidor,
      'El servidor no entregó la política de tratamiento de datos.',
    );
  }

  @override
  Future<ResultadoDeRegistro> registrar(SolicitudDeRegistro s) async {
    try {
      await _api.registroControllerRegistro(
        body: RegistroDeResidenteDto(
          usuario: s.usuario.trim(),
          correo: s.correo.trim(),
          contrasena: s.contrasena,
          confirmacion: s.confirmacion,
          codigoDeInvitacion: s.codigoDeInvitacion.trim(),
          fechaNacimiento: s.fechaNacimiento.trim(),
          // La casilla marcada es la condición para que el botón exista.
          aceptaTratamientoDeDatos: true,
          versionPolitica: s.versionPolitica,
        ),
      );
      return const CuentaCreada();
    } on DioException catch (e) {
      return rechazoDelRegistro(e);
    }
  }
}

/// Un rechazo de «Crear cuenta» traducido. Lo que no es una respuesta del
/// registro —sin red, un 5xx— sale como `Fallo`.
ResultadoDeRegistro rechazoDelRegistro(DioException e) {
  final respuesta = e.response;
  final cuerpo = respuesta?.data;
  switch (respuesta?.statusCode) {
    case 400:
      final politica = politicaDelRechazo(cuerpo);
      final campos = camposDelRechazo(cuerpo);
      if (campos.isNotEmpty) return RegistroConErrores(campos, politica: politica);
      return RegistroRechazado(detalleDeError(cuerpo) ?? 'Revise los datos', politica: politica);
    case 409:
      return RegistroRechazado(detalleDeError(cuerpo) ?? 'No se pudo crear la cuenta.');
    case 429:
      return RegistroRechazado(mensajeDeEspera(segundosDeEspera(respuesta)));
  }
  throw falloDeDio(e);
}
