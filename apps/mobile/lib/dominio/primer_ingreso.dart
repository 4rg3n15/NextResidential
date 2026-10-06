/// El primer ingreso (RONDA 15-W, D3): la cuenta ya trae su vivienda.
///
/// Quien entra por primera vez ya no escribe vivienda ni código: la de la
/// cuenta creada con un código de plaza es la de esa plaza, y la del titular
/// la asignó la administración. Completa a la PERSONA —nombres, documento de
/// adulto, teléfono y fecha de nacimiento— y el correo es opcional: la app
/// propone el que se escribió al crear la cuenta.
///
/// Las explicaciones de los motivos las manda el servidor; las de aquí son las
/// mismas palabras, para cuando una respuesta no traiga la suya. Un motivo que
/// el servidor añada mañana no se enseña crudo.
library;

import 'edad.dart';

/// Una cuenta es de un adulto: sus tres documentos.
const tiposDeDocumentoDeAdulto = <String, String>{
  'cedula': 'Cédula de ciudadanía',
  'cedula_extranjeria': 'Cédula de extranjería',
  'pasaporte': 'Pasaporte',
};

class DatosDePrimerIngreso {
  const DatosDePrimerIngreso({
    required this.nombres,
    required this.apellidos,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.telefono,
    required this.fechaNacimiento,
    required this.correo,
  });
  final String nombres;
  final String apellidos;
  final String tipoDocumento;
  final String numeroDocumento;

  /// Canal de CONTACTO, no de acceso.
  final String telefono;

  /// `AAAA-MM-DD`. Obligatoria: aquí se le pide a quien no pasó por «Crear
  /// cuenta», y una fecha de menor BLOQUEA la cuenta en el servidor.
  final String fechaNacimiento;

  /// Opcional: `null` si se dejó en blanco.
  final String? correo;
}

const motivoSinVivienda = 'SIN_VIVIENDA';
const motivoCuentaBloqueadaPorEdad = 'CUENTA_BLOQUEADA_POR_EDAD';
const motivoYaVinculada = 'YA_VINCULADA';

/// El titular no se cambia de vivienda desde la app: lo pide a la
/// administración (respuesta del cambio de vivienda del perfil).
const motivoTitularNoSeMuda = 'TITULAR_NO_SE_MUDA';

/// Lo que lee una cuenta sin vivienda asignada.
const avisoSinVivienda = 'La administración debe asignarle su vivienda';

/// El texto de cada motivo del primer ingreso y del cambio de vivienda, si el
/// servidor no mandó el suyo.
String explicacionDeAlta(String motivo) => switch (motivo) {
  motivoSinVivienda => avisoSinVivienda,
  motivoCuentaBloqueadaPorEdad => mensajeCuentaDeMenor,
  motivoYaVinculada => 'Su cuenta ya está vinculada a su vivienda.',
  'DOCUMENTO_EN_USO' =>
    'Ese documento ya está vinculado a otra cuenta o a otra vivienda. Consulte con el '
        'superadministrador.',
  motivoTitularNoSeMuda =>
    'Como titular de su vivienda, no puede cambiarse de vivienda desde la app: pídalo a la '
        'administración.',
  _ => 'El conjunto no permitió completar sus datos. Consulte con la administración.',
};
