// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_rostro_con_politica_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiRostroConPoliticaDto _$MiRostroConPoliticaDtoFromJson(
  Map<String, dynamic> json,
) => MiRostroConPoliticaDto(
  estado: MiRostroConPoliticaDtoEstado.fromJson(json['estado'] as String),
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
  politica: PoliticaDelRostroDto.fromJson(
    json['politica'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$MiRostroConPoliticaDtoToJson(
  MiRostroConPoliticaDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'calidad': instance.calidad,
  'registradoEn': instance.registradoEn?.toIso8601String(),
  'venceEn': instance.venceEn?.toIso8601String(),
  'diasParaVencer': instance.diasParaVencer,
  'equiposConRostro': instance.equiposConRostro,
  'equiposConMiRostro': instance.equiposConMiRostro,
  'equipos': instance.equipos,
  'politica': instance.politica,
};
