// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'primer_ingreso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrimerIngresoDto _$PrimerIngresoDtoFromJson(Map<String, dynamic> json) =>
    PrimerIngresoDto(
      nombres: json['nombres'] as String,
      apellidos: json['apellidos'] as String,
      tipoDocumento: PrimerIngresoDtoTipoDocumento.fromJson(
        json['tipoDocumento'] as String,
      ),
      numeroDocumento: json['numeroDocumento'] as String,
      telefono: json['telefono'] as String,
      fechaNacimiento: json['fechaNacimiento'] as String,
      correo: json['correo'] as String?,
    );

Map<String, dynamic> _$PrimerIngresoDtoToJson(PrimerIngresoDto instance) =>
    <String, dynamic>{
      'nombres': instance.nombres,
      'apellidos': instance.apellidos,
      'tipoDocumento': instance.tipoDocumento,
      'numeroDocumento': instance.numeroDocumento,
      'telefono': instance.telefono,
      'fechaNacimiento': instance.fechaNacimiento,
      'correo': instance.correo,
    };
