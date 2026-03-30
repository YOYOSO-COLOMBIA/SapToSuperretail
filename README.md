# SAP YOYOSO Sync

Sincroniza datos desde SAP B1 Service Layer hacia `YOYOSO.YOYOSO` en Azure SQL.

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
SQL_SERVER=etlyoyoso.database.windows.net
SQL_PORT=1433
SQL_DATABASE=YOYOSO
SQL_USER=adminyoyoso
SQL_PASSWORD=tu_clave_sql
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERT=false
SQL_SCHEMA=YOYOSO
ITEM_TABLE=articulomaestra
STOCK_TABLE=stockarticulos
CLIENT_TABLE=clientemaestra
LOG_TABLE=LOG_CARGA_SAP

# Dejalos en false cuando programes Logic Apps con ?mode=...
SYNC_ITEMS_ONLY=false
SYNC_STOCK_ONLY=false
SYNC_CLIENTS_ONLY=false
VALIDATION_ONLY=false
PORT=8080
RUN_TOKEN=tu_token
AUTO_RUN_ON_START=false

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
SAP_TIMEOUT_MS=300000
SAP_PAGINATION_CONCURRENCY=1

# Topes operativos actuales
SAP_MAX_PAGES=
SAP_MAX_RECORDS=
SAP_ITEM_MAX_RECORDS=10631
SAP_STOCK_MAX_RECORDS=6380
SAP_CLIENT_MAX_RECORDS=95000
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

En Linux App Service, `npm start` ahora levanta un servidor HTTP minimo para mantener viva la aplicacion.

## Trigger HTTP para Linux App Service

Endpoints:

- `GET /health`
- `GET /status`
- `POST /run-sync`

Proteccion:

- Si defines `RUN_TOKEN`, debes enviarlo en `x-run-token` o en `?token=...`

Ejemplo:

```bash
curl -X POST "https://tu-app.azurewebsites.net/run-sync?token=TU_TOKEN"
```

Tambien puedes ejecutar por tipo de carga sin tocar variables de entorno:

```bash
curl -X POST "https://tu-app.azurewebsites.net/run-sync?mode=items&token=TU_TOKEN"
curl -X POST "https://tu-app.azurewebsites.net/run-sync?mode=stock&token=TU_TOKEN"
curl -X POST "https://tu-app.azurewebsites.net/run-sync?mode=clients&token=TU_TOKEN"
```

Modos soportados:

- `full`
- `items`
- `stock`
- `clients`
- `validation`

## Programacion con Azure Logic Apps

La recomendacion operativa es:

- `items`: todos los dias a las `07:00`
- `stock`: todos los dias a las `08:00`
- `clients`: manual, una sola vez o cuando se requiera

Crea dos Logic Apps separadas con trigger `Recurrence` y una accion `HTTP`.

### Logic App de Items

- Metodo: `POST`
- URI: `https://TU-APP.azurewebsites.net/run-sync?mode=items`
- Header: `x-run-token: TU_TOKEN`
- Frecuencia: `Day`
- Intervalo: `1`
- Zona horaria: `SA Pacific Standard Time`
- Hora: `07:00`

### Logic App de Stock

- Metodo: `POST`
- URI: `https://TU-APP.azurewebsites.net/run-sync?mode=stock`
- Header: `x-run-token: TU_TOKEN`
- Frecuencia: `Day`
- Intervalo: `1`
- Zona horaria: `SA Pacific Standard Time`
- Hora: `08:00`

### Clientes manual

Cuando necesites ejecutarlo:

```bash
curl -X POST "https://TU-APP.azurewebsites.net/run-sync?mode=clients" -H "x-run-token: TU_TOKEN"
```

Con este esquema no necesitas cambiar `.env` para mover horarios; solo editas la recurrencia en Logic Apps.

Si quieres que el proceso corra automaticamente al iniciar el contenedor:

```env
AUTO_RUN_ON_START=true
```

Si quieres ejecutar el job una sola vez fuera del servidor HTTP:

```bash
npm run sync-once
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
- Reemplaza por lote usando `delete + insert` sobre las claves que llegaron desde SAP.

### Stock

- Se sincroniza por `cd_art_codi + cd_codigobodega`.
- Reemplaza por lote usando `delete + insert` sobre las claves que llegaron desde SAP.

## Recomendacion operativa

- Primero valida con `SAP_MAX_RECORDS=200` o `1000`.
- Luego sube a `5000`.
- Finalmente quita los limites para la corrida completa.
