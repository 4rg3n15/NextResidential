// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plaza_de_ocupante_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlazaDeOcupanteDto _$PlazaDeOcupanteDtoFromJson(Map<String, dynamic> json) =>
    PlazaDeOcupanteDto(
      id: json['id'] as String,
      numero: json['numero'] as num,
      libre: json['libre'] as bool,
      codigo: json['codigo'] as String?,
      ocupante: json['ocupante'] as String?,
    );

Map<String, dynamic> _$PlazaDeOcupanteDtoToJson(PlazaDeOcupanteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'numero': instance.numero,
      'libre': instance.libre,
      'codigo': instance.codigo,
      'ocupante': instance.ocupante,
    };
