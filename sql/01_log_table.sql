CREATE TABLE [YOYOSO].[LOG_CARGA_SAP] (
    [IdLog] INT IDENTITY(1,1) PRIMARY KEY,
    [Proceso] VARCHAR(100) NOT NULL,
    [FechaInicio] DATETIME NOT NULL,
    [FechaFin] DATETIME NOT NULL,
    [Estado] VARCHAR(20) NOT NULL,
    [Mensaje] NVARCHAR(MAX) NULL,
    [RegistrosItem] INT NOT NULL DEFAULT 0,
    [RegistrosClient] INT NOT NULL DEFAULT 0,
    [RegistrosStock] INT NOT NULL DEFAULT 0
);
