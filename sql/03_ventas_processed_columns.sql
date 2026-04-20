IF COL_LENGTH('YOYOSO.VENTAS', 'fl_procesado_sap') IS NULL
BEGIN
  ALTER TABLE [YOYOSO].[VENTAS]
    ADD [fl_procesado_sap] BIT NOT NULL
      CONSTRAINT [DF_VENTAS_fl_procesado_sap] DEFAULT (0);
END;

IF COL_LENGTH('YOYOSO.VENTAS', 'fe_procesado_sap') IS NULL
BEGIN
  ALTER TABLE [YOYOSO].[VENTAS]
    ADD [fe_procesado_sap] DATETIME2(0) NULL;
END;

IF COL_LENGTH('YOYOSO.VENTAS', 'nu_docentry_factura_sap') IS NULL
BEGIN
  ALTER TABLE [YOYOSO].[VENTAS]
    ADD [nu_docentry_factura_sap] INT NULL;
END;

IF COL_LENGTH('YOYOSO.VENTAS', 'nu_docentry_pago_sap') IS NULL
BEGIN
  ALTER TABLE [YOYOSO].[VENTAS]
    ADD [nu_docentry_pago_sap] INT NULL;
END;
