// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'edicion_de_menor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EdicionDeMenorDto _$EdicionDeMenorDtoFromJson(Map<String, dynamic> json) =>
    EdicionDeMenorDto(
      nombres: json['nombres'] as String,
      apellidos: json['apellidos'] as String,
      fechaNacimiento: json['fechaNacimiento'] as String,
      parentesco: json['parentesco'] as String,
    );

Map<String, dynamic> _$EdicionDeMenorDtoToJson(EdicionDeMenorDto instance) =>
    <String, dynamic>{
      'nombres': instance.nombres,
      'apellidos': instance.apellidos,
      'fechaNacimiento': instance.fechaNacimiento,
      'parentesco': instance.parentesco,
    };
