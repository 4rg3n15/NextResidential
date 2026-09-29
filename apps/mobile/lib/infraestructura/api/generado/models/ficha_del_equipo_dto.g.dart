// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ficha_del_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FichaDelEquipoDto _$FichaDelEquipoDtoFromJson(Map<String, dynamic> json) =>
    FichaDelEquipoDto(
      modelo: json['modelo'] as String?,
      firmware: json['firmware'] as String?,
      serie: json['serie'] as String?,
      horaDelEquipo: json['horaDelEquipo'] as String?,
      desvioDeRelojSegundos: json['desvioDeRelojSegundos'] as num?,
      hallazgos: (json['hallazgos'] as List<dynamic>)
          .map((e) => HallazgoDelEquipoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      sinComprobar: (json['sinComprobar'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      receptores: (json['receptores'] as List<dynamic>?)
          ?.map((e) => ReceptorDeLaFichaDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      crudos: (json['crudos'] as List<dynamic>?)
          ?.map(
            (e) =>
                DocumentoCrudoDelEquipoDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$FichaDelEquipoDtoToJson(FichaDelEquipoDto instance) =>
    <String, dynamic>{
      'receptores': instance.receptores,
      'modelo': instance.modelo,
      'firmware': instance.firmware,
      'serie': instance.serie,
      'horaDelEquipo': instance.horaDelEquipo,
      'desvioDeRelojSegundos': instance.desvioDeRelojSegundos,
      'hallazgos': instance.hallazgos,
      'sinComprobar': instance.sinComprobar,
      'crudos': instance.crudos,
    };
