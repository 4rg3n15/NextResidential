// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_mi_alta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeMiAltaDto _$EstadoDeMiAltaDtoFromJson(Map<String, dynamic> json) =>
    EstadoDeMiAltaDto(
      completa: json['completa'] as bool,
      viviendaVinculada: json['viviendaVinculada'] as bool,
      debeDeclararOcupantes: json['debeDeclararOcupantes'] as bool,
      vocabulario: VocabularioDeAltaDto.fromJson(
        json['vocabulario'] as Map<String, dynamic>,
      ),
      pideAgrupacion: json['pideAgrupacion'] as bool,
      avisoOcupantes: json['avisoOcupantes'] as String,
    );

Map<String, dynamic> _$EstadoDeMiAltaDtoToJson(EstadoDeMiAltaDto instance) =>
    <String, dynamic>{
      'completa': instance.completa,
      'viviendaVinculada': instance.viviendaVinculada,
      'debeDeclararOcupantes': instance.debeDeclararOcupantes,
      'vocabulario': instance.vocabulario,
      'pideAgrupacion': instance.pideAgrupacion,
      'avisoOcupantes': instance.avisoOcupantes,
    };
