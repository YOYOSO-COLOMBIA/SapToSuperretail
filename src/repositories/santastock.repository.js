const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');
const { sql } = require('../services/sql.service');
const logger = require('../utils/logger');

const INSERT_CHUNK_SIZE = 200;

function toDecimalOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

function toStringSafe(value, maxLength) {
  const text = value == null ? '' : String(value).trim();
  return text.slice(0, maxLength);
}

function mapStockRow(row) {
  return {
    cd_art_codi: toStringSafe(row.cd_codigoarticulo, 20),
    cd_codigobodega: toStringSafe(row.cd_codigobodega, 20),
    am_cantidad: toDecimalOrNull(row.am_cantidad)
  };
}

function validateMappedRow(mapped, index) {
  if (!mapped.cd_art_codi) {
    throw new Error(`Fila ${index + 1}: cd_codigoarticulo viene vacio.`);
  }
  if (!mapped.cd_codigobodega) {
    throw new Error(`Fila ${index + 1}: cd_codigobodega viene vacio.`);
  }
  if (mapped.am_cantidad === null) {
    throw new Error(`Fila ${index + 1}: am_cantidad no es numerico.`);
  }
}

async function upsertStockArticulos(tx, rows) {
  const target = tableName(app.schema, app.stockTable);
  const stageTable = await getStageTableName(tx);
  const mappedRows = rows.map((row, index) => {
    const mapped = mapStockRow(row);
    validateMappedRow(mapped, index);
    return mapped;
  });

  const stageRows = dedupeByWarehouseItem(mappedRows);

  logger.info('Preparando carga de stockarticulos', {
    sourceRows: rows.length,
    uniqueRows: stageRows.length
  });

  if (stageRows.length === 0) {
    return { updated: 0, inserted: 0 };
  }

  await createStageTable(tx, stageTable);
  await insertStageRows(tx, stageRows, stageTable);

  const updated = await updateExistingRows(tx, target, stageTable);
  const inserted = await insertMissingRows(tx, target, stageTable);
  await dropStageTable(tx, stageTable);

  return { updated, inserted };
}

function dedupeByWarehouseItem(rows) {
  const unique = new Map();

  for (const row of rows) {
    unique.set(`${row.cd_art_codi}|${row.cd_codigobodega}`, row);
  }

  return Array.from(unique.values());
}

async function getStageTableName(tx) {
  const req = createRequest(tx);
  const result = await req.query('SELECT @@SPID AS spid;');
  const spid = result.recordset?.[0]?.spid;
  return `##stockarticulos_stage_${spid}`;
}

async function createStageTable(tx, stageTable) {
  const req = createRequest(tx);
  await req.query(`
    IF OBJECT_ID('tempdb..${stageTable}') IS NOT NULL
      DROP TABLE ${stageTable};

    CREATE TABLE ${stageTable}
    (
      cd_art_codi VARCHAR(20) NOT NULL,
      cd_codigobodega VARCHAR(20) NOT NULL,
      am_cantidad NUMERIC(12,2) NOT NULL,
      PRIMARY KEY (cd_art_codi, cd_codigobodega)
    );
  `);
}

async function insertStageRows(tx, rows, stageTable) {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
    const req = createRequest(tx);

    const valuesSql = chunk.map((row, index) => {
      req.input(`cd_art_codi_${index}`, sql.VarChar(20), row.cd_art_codi);
      req.input(`cd_codigobodega_${index}`, sql.VarChar(20), row.cd_codigobodega);
      req.input(`am_cantidad_${index}`, sql.Numeric(12, 2), row.am_cantidad);

      return `(
        @cd_art_codi_${index},
        @cd_codigobodega_${index},
        @am_cantidad_${index}
      )`;
    }).join(',\n');

    await req.query(`
      INSERT INTO ${stageTable}
      (
        cd_art_codi,
        cd_codigobodega,
        am_cantidad
      )
      VALUES
      ${valuesSql};
    `);

    logger.info('Bloque cargado a stage de stockarticulos', {
      insertedRows: offset + chunk.length,
      totalRows: rows.length
    });
  }
}

async function updateExistingRows(tx, target, stageTable) {
  const req = createRequest(tx);
  const result = await req.query(`
    UPDATE target
    SET
      target.am_cantidad = stage.am_cantidad
    FROM ${target} AS target
    INNER JOIN ${stageTable} AS stage
      ON stage.cd_art_codi = target.cd_art_codi
     AND stage.cd_codigobodega = target.cd_codigobodega;

    SELECT @@ROWCOUNT AS updated;
  `);

  return result.recordset?.[0]?.updated || 0;
}

async function insertMissingRows(tx, target, stageTable) {
  const req = createRequest(tx);
  const result = await req.query(`
    INSERT INTO ${target}
    (
      cd_art_codi,
      cd_codigobodega,
      am_cantidad
    )
    SELECT
      stage.cd_art_codi,
      stage.cd_codigobodega,
      stage.am_cantidad
    FROM ${stageTable} AS stage
    LEFT JOIN ${target} AS target
      ON target.cd_art_codi = stage.cd_art_codi
     AND target.cd_codigobodega = stage.cd_codigobodega
    WHERE target.cd_art_codi IS NULL;

    SELECT @@ROWCOUNT AS inserted;
  `);

  return result.recordset?.[0]?.inserted || 0;
}

async function dropStageTable(tx, stageTable) {
  const req = createRequest(tx);
  await req.query(`
    IF OBJECT_ID('tempdb..${stageTable}') IS NOT NULL
      DROP TABLE ${stageTable};
  `);
}

module.exports = { upsertStockArticulos, mapStockRow };
