/// Los campos de la persona: los comparten el alta del primer ingreso (3.2) y
/// la edición del perfil (3.5).
///
/// Una sola definición para que las dos pantallas no puedan pedir cosas
/// distintas. Los nombres de los campos son los del dominio compartido
/// (`nombres`, `numeroDocumento`…), porque con esos nombres devuelve el servidor
/// lo que rechazó, y el error se pinta debajo del campo que toca.
///
/// La validación de aquí es CORTESÍA: la real es la del servidor, que además
/// sanea y normaliza (§2.7.3–4).
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';

class ControlesDePerfil {
  ControlesDePerfil([PerfilDelResidente? inicial])
    : nombres = TextEditingController(text: inicial?.nombres ?? ''),
      apellidos = TextEditingController(text: inicial?.apellidos ?? ''),
      fechaNacimiento = TextEditingController(text: inicial?.fechaNacimiento ?? ''),
      numeroDocumento = TextEditingController(text: inicial?.numeroDocumento ?? ''),
      correo = TextEditingController(text: inicial?.correo ?? ''),
      telefono = TextEditingController(text: inicial?.telefono ?? ''),
      tipoDocumento = tiposDeDocumento.containsKey(inicial?.tipoDocumento)
          ? inicial!.tipoDocumento!
          : 'cedula';

  final TextEditingController nombres;
  final TextEditingController apellidos;
  final TextEditingController fechaNacimiento;
  final TextEditingController numeroDocumento;
  final TextEditingController correo;
  final TextEditingController telefono;
  String tipoDocumento;

  DatosDePerfil leer() => DatosDePerfil(
    nombres: nombres.text.trim(),
    apellidos: apellidos.text.trim(),
    fechaNacimiento: fechaNacimiento.text.trim().isEmpty ? null : fechaNacimiento.text.trim(),
    tipoDocumento: tipoDocumento,
    numeroDocumento: numeroDocumento.text.trim(),
    correo: correo.text.trim(),
    telefono: telefono.text.trim(),
  );

  void liberar() {
    for (final c in [nombres, apellidos, fechaNacimiento, numeroDocumento, correo, telefono]) {
      c.dispose();
    }
  }

  /// `errores` son los que devolvió el servidor, por nombre de campo.
  List<Widget> campos({
    required Map<String, String> errores,
    required void Function(String) alCambiarTipo,
  }) {
    String? requerido(String? v, String etiqueta) =>
        (v == null || v.trim().isEmpty) ? 'Escriba $etiqueta' : null;
    Widget texto(
      TextEditingController c,
      String campo,
      String etiqueta, {
      TextInputType? teclado,
      String? ayuda,
      String? Function(String?)? validar,
      List<String>? autocompletar,
    }) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        key: Key('perfil.$campo'),
        controller: c,
        keyboardType: teclado,
        autofillHints: autocompletar,
        decoration: InputDecoration(
          labelText: etiqueta,
          helperText: ayuda,
          errorText: errores[campo],
        ),
        validator: validar,
      ),
    );

    return [
      texto(
        nombres,
        'nombres',
        'Nombres',
        validar: (v) => requerido(v, 'su nombre'),
        autocompletar: const [AutofillHints.givenName],
      ),
      texto(
        apellidos,
        'apellidos',
        'Apellidos',
        validar: (v) => requerido(v, 'sus apellidos'),
        autocompletar: const [AutofillHints.familyName],
      ),
      texto(
        fechaNacimiento,
        'fechaNacimiento',
        'Fecha de nacimiento (opcional)',
        teclado: TextInputType.datetime,
        ayuda: 'AAAA-MM-DD',
        validar: (v) =>
            (v == null || v.trim().isEmpty || RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v.trim()))
            ? null
            : 'Use el formato AAAA-MM-DD',
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DropdownButtonFormField<String>(
          key: const Key('perfil.tipoDocumento'),
          initialValue: tipoDocumento,
          decoration: InputDecoration(
            labelText: 'Tipo de documento',
            errorText: errores['tipoDocumento'],
          ),
          items: tiposDeDocumento.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (v) {
            if (v != null) alCambiarTipo(v);
          },
        ),
      ),
      texto(
        numeroDocumento,
        'numeroDocumento',
        'Número de documento',
        validar: (v) => requerido(v, 'su número de documento'),
      ),
      texto(
        correo,
        'correo',
        'Correo de contacto',
        teclado: TextInputType.emailAddress,
        // D9 · no hay SMTP: el correo es un dato de contacto, no de acceso.
        ayuda: 'Para que la administración le contacte. No se usa para entrar.',
        validar: (v) => (v != null && v.contains('@')) ? null : 'Escriba un correo válido',
        autocompletar: const [AutofillHints.email],
      ),
      texto(
        telefono,
        'telefono',
        'Teléfono',
        teclado: TextInputType.phone,
        validar: (v) => RegExp(r'^\+?[0-9 ]{7,18}$').hasMatch((v ?? '').trim())
            ? null
            : 'Escriba un teléfono de 7 a 15 cifras',
        autocompletar: const [AutofillHints.telephoneNumber],
      ),
    ];
  }
}

/// El recuadro de un rechazo del servidor que no es de un campo concreto.
class AvisoDeRechazo extends StatelessWidget {
  const AvisoDeRechazo(this.texto, {super.key});
  final String texto;

  @override
  Widget build(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: esquema.errorContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(texto, style: TextStyle(color: esquema.onErrorContainer)),
      ),
    );
  }
}
