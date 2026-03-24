/*
USA ESTE SCRIPT SOLO SI QUIERES PROBAR EL JOB ANTES DE TENER EL MODELO REAL.

Agrega una columna JsonData en cada tabla para guardar el payload completo.
Cuando tengas las columnas finales, elimina este modo y ajusta los repositorios.
*/

ALTER TABLE [YOYOSO].[SANTAITEM] ADD [JsonData] NVARCHAR(MAX) NULL;
ALTER TABLE [YOYOSO].[SANTACLIENT] ADD [JsonData] NVARCHAR(MAX) NULL;
ALTER TABLE [YOYOSO].[SANTASTOCK] ADD [JsonData] NVARCHAR(MAX) NULL;
