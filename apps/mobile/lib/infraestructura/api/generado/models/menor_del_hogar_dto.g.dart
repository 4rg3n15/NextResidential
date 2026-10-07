// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'menor_del_hogar_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MenorDelHogarDto _$MenorDelHogarDtoFromJson(Map<String, dynamic> json) =>
    MenorDelHogarDto(
      residenteId: json['residenteId'] as String,
      nombres: json['nombres'] as String?,
      apellidos: json['apellidos'] as String?,
      nombreCompleto: json['nombreCompleto'] as String,
      fechaNacimiento: json['fechaNacimiento'] as String?,
      edad: json['edad'] as num?,
      tipoDocumento: json['tipoDocumento'] as String,
      documento: json['documento'] as String,
      parentesco: json['parentesco'] as String?,
      plazaId: json['plazaId'] as String?,
      plazaNumero: json['plazaNumero'] as num?,
      tieneRostro: json['tieneRostro'] as bool,
    );

Map<String, dynamic> _$MenorDelHogarDtoToJson(MenorDelHogarDto instance) =>
    <String, dynamic>{
      'residenteId': instance.residenteId,
      'nombres': instance.nombres,
      'apellidos': instance.apellidos,
      'nombreCompleto': instance.nombreCompleto,
      'fechaNacimiento': instance.fechaNacimiento,
      'edad': instance.edad,
      'tipoDocumento': instance.tipoDocumento,
      'documento': instance.documento,
      'parentesco': instance.parentesco,
      'plazaId': instance.plazaId,
      'plazaNumero': instance.plazaNumero,
      'tieneRostro': instance.tieneRostro,
    };
