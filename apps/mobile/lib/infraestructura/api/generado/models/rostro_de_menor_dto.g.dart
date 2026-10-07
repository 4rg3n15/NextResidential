// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rostro_de_menor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RostroDeMenorDto _$RostroDeMenorDtoFromJson(Map<String, dynamic> json) =>
    RostroDeMenorDto(
      contenidoBase64: json['contenidoBase64'] as String,
      tipoMime: RostroDeMenorDtoTipoMime.fromJson(json['tipoMime'] as String),
      medidas: MedidasDeFotoDto.fromJson(
        json['medidas'] as Map<String, dynamic>,
      ),
      versionPolitica: json['versionPolitica'] as String,
      aceptaPolitica: json['aceptaPolitica'] as bool,
      declaraRepresentacionLegal: json['declaraRepresentacionLegal'] as bool,
      menorInformadoYDeAcuerdo: json['menorInformadoYDeAcuerdo'] as bool,
    );

Map<String, dynamic> _$RostroDeMenorDtoToJson(RostroDeMenorDto instance) =>
    <String, dynamic>{
      'contenidoBase64': instance.contenidoBase64,
      'tipoMime': instance.tipoMime,
      'medidas': instance.medidas,
      'versionPolitica': instance.versionPolitica,
      'aceptaPolitica': instance.aceptaPolitica,
      'declaraRepresentacionLegal': instance.declaraRepresentacionLegal,
      'menorInformadoYDeAcuerdo': instance.menorInformadoYDeAcuerdo,
    };
