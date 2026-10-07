// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_mi_rostro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeMiRostroDto _$EstadoDeMiRostroDtoFromJson(Map<String, dynamic> json) =>
    EstadoDeMiRostroDto(
      estado: EstadoDeMiRostroDtoEstado.fromJson(json['estado'] as String),
      calidad: json['calidad'] as num?,
      registradoEn: json['registradoEn'] == null
          ? null
          : DateTime.parse(json['registradoEn'] as String),
      venceEn: json['venceEn'] == null
          ? null
          : DateTime.parse(json['venceEn'] as String),
      diasParaVencer: json['diasParaVencer'] as num?,
      equiposConRostro: json['equiposConRostro'] as num,
      equiposConMiRostro: json['equiposConMiRostro'] as num,
      equipos: (json['equipos'] as List<dynamic>)
          .map((e) => EquipoDelRostroDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$EstadoDeMiRostroDtoToJson(
  EstadoDeMiRostroDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'calidad': instance.calidad,
  'registradoEn': instance.registradoEn?.toIso8601String(),
  'venceEn': instance.venceEn?.toIso8601String(),
  'diasParaVencer': instance.diasParaVencer,
  'equiposConRostro': instance.equiposConRostro,
  'equiposConMiRostro': instance.equiposConMiRostro,
  'equipos': instance.equipos,
};
