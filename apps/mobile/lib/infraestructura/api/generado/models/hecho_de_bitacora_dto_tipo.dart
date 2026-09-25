// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum HechoDeBitacoraDtoTipo {
  @JsonValue('inicio_de_sesion')
  inicioDeSesion('inicio_de_sesion'),
  @JsonValue('acceso_rechazado')
  accesoRechazado('acceso_rechazado'),
  @JsonValue('cierre_de_sesion')
  cierreDeSesion('cierre_de_sesion'),
  @JsonValue('inicio_de_patrullaje')
  inicioDePatrullaje('inicio_de_patrullaje'),
  @JsonValue('fin_de_patrullaje')
  finDePatrullaje('fin_de_patrullaje'),
  @JsonValue('codigo_incorrecto')
  codigoIncorrecto('codigo_incorrecto'),
  @JsonValue('turno_asignado')
  turnoAsignado('turno_asignado'),
  @JsonValue('turno_extra')
  turnoExtra('turno_extra'),
  @JsonValue('turno_editado')
  turnoEditado('turno_editado'),
  @JsonValue('turno_retirado')
  turnoRetirado('turno_retirado'),
  @JsonValue('solape_de_turno')
  solapeDeTurno('solape_de_turno'),
  @JsonValue('alta_de_portero')
  altaDePortero('alta_de_portero'),
  @JsonValue('edicion_de_portero')
  edicionDePortero('edicion_de_portero'),
  @JsonValue('restablecimiento_de_contrasena')
  restablecimientoDeContrasena('restablecimiento_de_contrasena'),
  @JsonValue('cambio_de_contrasena')
  cambioDeContrasena('cambio_de_contrasena'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const HechoDeBitacoraDtoTipo(this.json);

  factory HechoDeBitacoraDtoTipo.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<HechoDeBitacoraDtoTipo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
