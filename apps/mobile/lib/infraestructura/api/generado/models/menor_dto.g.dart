// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'menor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MenorDto _$MenorDtoFromJson(Map<String, dynamic> json) => MenorDto(
  nombres: json['nombres'] as String,
  apellidos: json['apellidos'] as String,
  fechaNacimiento: json['fechaNacimiento'] as String,
  parentesco: json['parentesco'] as String,
  tipoDocumento: MenorDtoTipoDocumento.fromJson(
    json['tipoDocumento'] as String,
  ),
  numeroDocumento: json['numeroDocumento'] as String,
  plazaId: json['plazaId'] as String,
);

Map<String, dynamic> _$MenorDtoToJson(MenorDto instance) => <String, dynamic>{
  'nombres': instance.nombres,
  'apellidos': instance.apellidos,
  'fechaNacimiento': instance.fechaNacimiento,
  'parentesco': instance.parentesco,
  'tipoDocumento': instance.tipoDocumento,
  'numeroDocumento': instance.numeroDocumento,
  'plazaId': instance.plazaId,
};
