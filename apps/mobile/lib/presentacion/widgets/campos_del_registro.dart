/// Los seis campos de «Crear cuenta» (RONDA 15-W), con su cortesía.
///
/// Salieron de la pantalla para que la pantalla se ocupe de lo suyo —la
/// política, el envío y la entrada— y esto de lo que se escribe. Cada campo
/// lleva el nombre con el que el SERVIDOR devuelve sus rechazos (`usuario`,
/// `codigoDeInvitacion`…), así que el error del servidor se pinta debajo del
/// campo que nombra. La validación de aquí es cortesía: decide el servidor.
library;

import 'package:flutter/material.dart';

import '../../dominio/acceso.dart';
import '../../dominio/edad.dart';
import '../../dominio/registro.dart';
import 'campo_de_fecha.dart';

class ControlesDelRegistro {
  final usuario = TextEditingController();
  final correo = TextEditingController();
  final contrasena = TextEditingController();
  final confirmacion = TextEditingController();
  final codigo = TextEditingController();
  final fecha = TextEditingController();

  bool get contrasenasDistintas =>
      confirmacion.text.isNotEmpty && confirmacion.text != contrasena.text;

  void liberar() {
    for (final c in [usuario, correo, contrasena, confirmacion, codigo, fecha]) {
      c.dispose();
    }
  }
}

class CamposDelRegistro extends StatelessWidget {
  const CamposDelRegistro({
    super.key,
    required this.controles,
    required this.errores,
    required this.hoy,
    required this.alCambiar,
  });

  final ControlesDelRegistro controles;

  /// Los que devolvió el servidor, por nombre de campo.
  final Map<String, String> errores;
  final DateTime hoy;
  final VoidCallback alCambiar;

  Widget _texto(
    TextEditingController c,
    String campo,
    String etiqueta, {
    String? ayuda,
    bool oculto = false,
    TextInputType? teclado,
    String? Function(String)? cortesia,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      key: Key('registro.$campo'),
      controller: c,
      obscureText: oculto,
      keyboardType: teclado,
      autocorrect: false,
      textCapitalization: campo == 'codigoDeInvitacion'
          ? TextCapitalization.characters
          : TextCapitalization.none,
      decoration: InputDecoration(
        labelText: etiqueta,
        helperText: ayuda,
        helperMaxLines: 2,
        errorText: errores[campo],
        errorMaxLines: 3,
      ),
      validator: cortesia == null ? null : (v) => cortesia(v ?? ''),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final c = controles;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _texto(c.usuario, 'usuario', 'Usuario', cortesia: motivoDeUsuarioInvalido),
        _texto(
          c.correo,
          'correo',
          'Correo',
          teclado: TextInputType.emailAddress,
          ayuda: 'Para que la administración le contacte. No se usa para entrar.',
          cortesia: motivoDeCorreoInvalido,
        ),
        _texto(
          c.contrasena,
          'contrasena',
          'Contraseña',
          oculto: true,
          ayuda: '8 o más caracteres, con mayúscula, minúscula, número y símbolo',
          cortesia: motivoDeRechazoDeContrasena,
        ),
        _texto(c.confirmacion, 'confirmacion', 'Confirme la contraseña', oculto: true),
        // El botón no responde con las contraseñas distintas: se dice por qué.
        if (c.contrasenasDistintas)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text('Las contraseñas no coinciden', key: Key('registro.noCoinciden')),
          ),
        _texto(
          c.codigo,
          'codigoDeInvitacion',
          'Código de invitación',
          ayuda: 'Pídaselo al titular de su vivienda: lo ve en Ocupantes',
          cortesia: motivoDeCodigoDeInvitacion,
        ),
        CampoDeFecha(
          key: const Key('registro.fechaNacimiento'),
          controlador: c.fecha,
          etiqueta: 'Fecha de nacimiento',
          hoy: hoy,
          error: errores['fechaNacimiento'],
          validar: (v) => motivoDeFechaDeAdulto(v ?? '', hoy),
          alCambiar: alCambiar,
        ),
      ],
    );
  }
}
