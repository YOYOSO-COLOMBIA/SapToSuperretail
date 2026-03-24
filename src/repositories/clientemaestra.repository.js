const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');
const { sql } = require('../services/sql.service');
const logger = require('../utils/logger');
const INSERT_CHUNK_SIZE = 250;

function toBigIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toStringSafe(value, maxLength) {
  const text = value == null ? '' : String(value).trim();
  return text.slice(0, maxLength);
}

function mapClientRow(row) {
  return {
    id_cliente: toBigIntOrNull(row.id__),
    cd_codigodocumento: toBigIntOrNull(row.am_nit),
    ds_nombre: toStringSafe(row.ds_nombre, 200),
    ds_telefono: toStringSafe(row.ds_telefono, 10),
    ds_celular: toStringSafe(row.ds_celular, 10),
    ds_email: toStringSafe(row.ds_email, 100)
  };
}

function validateMappedRow(mapped, index) {
  if (mapped.id_cliente === null) {
    throw new Error(`Fila ${index + 1}: id__ es nulo o no numérico.`);
  }
  if (mapped.cd_codigodocumento === null) {
    throw new Error(`Fila ${index + 1}: am_nit es nulo o no numérico.`);
  }
  if (!mapped.ds_nombre) {
    throw new Error(`Fila ${index + 1}: ds_nombre viene vacío.`);
  }
}

async function upsertClienteMaestra(tx, rows) {
  const target = tableName(app.schema, app.clientTable);
  const stageTable = await getStageTableName(tx);
  const { validRows, invalidRows } = normalizeRows(rows);

  const stageRows = dedupeByDocument(validRows);

  logger.info('Preparando carga de clientemaestra', {
    sourceRows: rows.length,
    uniqueRows: stageRows.length,
    skippedInvalid: invalidRows.length
  });

  if (stageRows.length === 0) {
    return { updated: 0, inserted: 0, skippedInvalid: invalidRows.length };
  }

  await createStageTable(tx, stageTable);
  await insertStageRows(tx, stageRows, stageTable);

  const updated = await updateExistingRows(tx, target, stageTable);
  const inserted = await insertMissingRows(tx, target, stageTable);
  await dropStageTable(tx, stageTable);

  return { updated, inserted, skippedInvalid: invalidRows.length };
}

function normalizeRows(rows) {
  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    try {
      const mapped = mapClientRow(row);
      validateMappedRow(mapped, index);
      validRows.push(mapped);
    } catch (error) {
      invalidRows.push({ index: index + 1, reason: error.message });
    }
  });

  if (invalidRows.length > 0) {
    logger.info('Filas invalidas omitidas en clientemaestra', {
      count: invalidRows.length,
      sample: invalidRows.slice(0, 5)
    });
  }

  return { validRows, invalidRows };
}

async function getStageTableName(tx) {
  const req = createRequest(tx);
  const result = await req.query('SELECT @@SPID AS spid;');
  const spid = result.recordset?.[0]?.spid;
  return `##clientemaestra_stage_${spid}`;
}

function dedupeByDocument(rows) {
  const unique = new Map();

  for (const row of rows) {
    unique.set(String(row.cd_codigodocumento), row);
  }

  return Array.from(unique.values());
}

async function createStageTable(tx, stageTable) {
  const req = createRequest(tx);
  await req.query(`
    IF OBJECT_ID('tempdb..${stageTable}') IS NOT NULL
      DROP TABLE ${stageTable};

    CREATE TABLE ${stageTable}
    (
      cd_codigodocumento BIGINT NOT NULL PRIMARY KEY,
      ds_nombre VARCHAR(200) NOT NULL,
      ds_telefono VARCHAR(10) NOT NULL,
      ds_celular VARCHAR(10) NOT NULL,
      ds_email VARCHAR(100) NOT NULL
    );
  `);
}

async function insertStageRows(tx, rows, stageTable) {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
    const req = createRequest(tx);

    const valuesSql = chunk.map((row, index) => {
      req.input(`cd_codigodocumento_${index}`, sql.BigInt, row.cd_codigodocumento);
      req.input(`ds_nombre_${index}`, sql.VarChar(200), row.ds_nombre);
      req.input(`ds_telefono_${index}`, sql.VarChar(10), row.ds_telefono);
      req.input(`ds_celular_${index}`, sql.VarChar(10), row.ds_celular);
      req.input(`ds_email_${index}`, sql.VarChar(100), row.ds_email);

      return `(
        @cd_codigodocumento_${index},
        @ds_nombre_${index},
        @ds_telefono_${index},
        @ds_celular_${index},
        @ds_email_${index}
      )`;
    }).join(',\n');

    await req.query(`
      INSERT INTO ${stageTable}
      (
        cd_codigodocumento,
        ds_nombre,
        ds_telefono,
        ds_celular,
        ds_email
      )
      VALUES
      ${valuesSql};
    `);

    logger.info('Bloque cargado a stage de clientemaestra', {
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
      target.ds_nombre = stage.ds_nombre,
      target.ds_telefono = stage.ds_telefono,
      target.ds_celular = stage.ds_celular,
      target.ds_email = stage.ds_email
    FROM ${target} AS target
    INNER JOIN ${stageTable} AS stage
      ON stage.cd_codigodocumento = target.cd_codigodocumento;

    SELECT @@ROWCOUNT AS updated;
  `);

  return result.recordset?.[0]?.updated || 0;
}

async function insertMissingRows(tx, target, stageTable) {
  const req = createRequest(tx);
  const result = await req.query(`
    INSERT INTO ${target}
    (
      cd_codigodocumento,
      ds_nombre,
      ds_telefono,
      ds_celular,
      ds_email
    )
    SELECT
      stage.cd_codigodocumento,
      stage.ds_nombre,
      stage.ds_telefono,
      stage.ds_celular,
      stage.ds_email
    FROM ${stageTable} AS stage
    LEFT JOIN ${target} AS target
      ON target.cd_codigodocumento = stage.cd_codigodocumento
    WHERE target.cd_codigodocumento IS NULL;

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

module.exports = { upsertClienteMaestra, mapClientRow };
