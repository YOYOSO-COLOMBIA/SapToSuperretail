# Operacion De Cargas

Este documento resume las tres cargas del proyecto, cuando se ejecutan y como dispararlas.

## Requisitos

- La app debe estar desplegada en App Service o ejecutandose localmente.
- `RUN_TOKEN` debe coincidir con el configurado en el entorno.
- Si se usa App Service Linux, la app corre con:

```bash
npm start
```

## 1. Items

Origen:
- `SANTAITEM`

Destino:
- `YOYOSO.articulomaestra`

Frecuencia operativa:
- Diario a las `07:00 AM`

Metodologia:
- `delete + insert` por las claves del lote recibido

Ejecucion manual por HTTP:

```bash
curl -X POST "https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=items&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2"
```

Uso en Azure Logic App:
- Metodo: `POST`
- URI:

```text
https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=items&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2
```

## 2. Stock

Origen:
- `SANTASTOCK`

Destino:
- `YOYOSO.stockarticulos`

Frecuencia operativa:
- Diario a las `08:00 AM`

Metodologia:
- `delete + insert` por las claves del lote recibido

Ejecucion manual por HTTP:

```bash
curl -X POST "https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=stock&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2"
```

Uso en Azure Logic App:
- Metodo: `POST`
- URI:

```text
https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=stock&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2
```

## 3. Clients

Origen:
- `SANTACLIENT`

Destino:
- `YOYOSO.clientemaestra`

Frecuencia operativa:
- Manual, una sola vez o bajo demanda

Metodologia:
- `update + insert`

Ejecucion manual por HTTP:

```bash
curl -X POST "https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=clients&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2"
```

No se recomienda programarla diariamente.

## Validacion

Si necesitas validar conectividad sin cargar datos:

```bash
curl -X POST "https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/run-sync?mode=validation&token=YoyosoSync_2026_3R7kN9pQ4LmX8vB2"
```

## Estado

Para revisar si hay una corrida en curso o el resultado de la ultima:

```bash
curl "https://yoyoso-ebbyauhmcjaddqc2.westus-01.azurewebsites.net/health"
```

## Ejecucion Local

Para levantar el servidor local:

```bash
npm start
```

Para ejecutar un job unico fuera del servidor HTTP:

```bash
npm run sync-once
```
