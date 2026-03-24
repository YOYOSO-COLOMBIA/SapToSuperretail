# SAP YOYOSO Sync

Sincroniza datos desde SAP B1 Service Layer hacia `Audinet.Yoyoso`.

## Cargas soportadas

- `SANTACLIENT` -> `Yoyoso.clientemaestra`
- `SANTAITEM` -> `Yoyoso.articulomaestra`
- `SANTASTOCK` -> `Yoyoso.stockarticulos`

## Comportamiento actual

- Hace login contra SAP B1 Service Layer.
- Sigue la paginacion de SAP.
- Inserta y actualiza en SQL por lotes.
- Omite filas invalidas de SAP y las reporta en logs.
- Intenta registrar el resultado en `Yoyoso.LOG_CARGA_SAP` si la tabla existe.

## Variables necesarias

Configuralas en App Service o en `.env`.

```env
# SQL Server
SQL_SERVER=10.10.0.251
SQL_PORT=1433
SQL_DATABASE=Audinet
SQL_USER=usuario_sql
SQL_PASSWORD=tu_clave_sql
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERT=true
SQL_SCHEMA=Yoyoso
ITEM_TABLE=articulomaestra
STOCK_TABLE=stockarticulos
CLIENT_TABLE=clientemaestra
LOG_TABLE=LOG_CARGA_SAP

# Modos
SYNC_ITEMS_ONLY=false
SYNC_STOCK_ONLY=false
SYNC_CLIENTS_ONLY=false
VALIDATION_ONLY=false

# SAP B1 Service Layer
SAP_BASE_URL=https://40.65.202.139:50000
SAP_LOGIN_PATH=/b1s/v1/Login
SAP_ITEM_PATH=/b1s/v2/sml.svc/SANTAITEM
SAP_CLIENT_PATH=/b1s/v2/sml.svc/SANTACLIENT
SAP_STOCK_PATH=/b1s/v2/sml.svc/SANTASTOCK
SAP_COMPANY_DB=YOYOSO
SAP_USERNAME=manager
SAP_PASSWORD=tu_clave_sap
SAP_REJECT_UNAUTHORIZED=false
SAP_TIMEOUT_MS=120000

# Solo para pruebas controladas. En produccion dejalas vacias.
SAP_MAX_PAGES=
SAP_MAX_RECORDS=
SAP_ITEM_MAX_RECORDS=
SAP_STOCK_MAX_RECORDS=
SAP_CLIENT_MAX_RECORDS=
```

## Produccion

Para ejecutar la sincronizacion completa:

- `SYNC_ITEMS_ONLY=false`
- `SYNC_STOCK_ONLY=false`
- `SYNC_CLIENTS_ONLY=false`
- `VALIDATION_ONLY=false`
- `SAP_MAX_PAGES=` vacio
- `SAP_MAX_RECORDS=` vacio

Ejecuta:

```bash
npm start
```

## Pruebas parciales

Para probar una sola carga:

- Solo clientes: `SYNC_CLIENTS_ONLY=true`
- Solo articulos: `SYNC_ITEMS_ONLY=true`
- Solo stock: `SYNC_STOCK_ONLY=true`

Con limite controlado:

```env
SAP_MAX_RECORDS=200
```

Tambien puedes definir limites por coleccion:

```env
SAP_ITEM_MAX_RECORDS=10631
SAP_STOCK_MAX_RECORDS=6380
SAP_CLIENT_MAX_RECORDS=95000
```

## Notas de sincronizacion

### Clientes

- Se sincroniza por `cd_codigodocumento`.
- `id_cliente` lo genera SQL Server si la tabla usa `IDENTITY`.
- Omite filas con `am_nit` invalido o `ds_nombre` vacio.

### Articulos

- Se sincroniza por `cd_ART_CODI`.
- `id_articulo` lo genera SQL Server si la tabla usa `IDENTITY`.
- Omite filas con datos obligatorios invalidos.

### Stock

- Se sincroniza por `cd_art_codi + cd_codigobodega`.
- Actualiza `am_cantidad` si la fila ya existe.

## Recomendacion operativa

- Primero valida con `SAP_MAX_RECORDS=200` o `1000`.
- Luego sube a `5000`.
- Finalmente quita los limites para la corrida completa.
