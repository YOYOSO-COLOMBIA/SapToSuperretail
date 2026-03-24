const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');
const { sql } = require('../services/sql.service');
const logger = require('../utils/logger');

const INSERT_CHUNK_SIZE = 100;

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

function toDateOrNull(value) {
  if (!value) return null;
  const iso = String(value).trim().slice(0, 10);
  return iso || null;
}

function mapItemRow(row) {
  return {
    cd_ART_CODI: toStringSafe(row.cd_ART_CODI, 20),
    cd_ART_REFE: toStringSafe(row.cd_ART_REFE, 20),
    ds_ART_NOMB: toStringSafe(row.ds_ART_NOMB, 200),
    am_ART_VCOS: toDecimalOrNull(row.am_ART_VCOS),
    cd_ART_TIPO: toStringSafe(row.cd_ART_TIPO, 1),
    cd_ART_PREC: toDecimalOrNull(row.cd_ART_PREC),
    cd_IVA_CODI: toStringSafe(row.cd_IVA_CODI, 2),
    dt_ART_FCRE: toDateOrNull(row.dt_ART_FCRE),
    dt_ART_FMOD: toDateOrNull(row.dt_ART_FMOD),
    cd_NI1_CODI: toStringSafe(row.cd_NI1_CODI, 6),
    cd_NI2_CODI: toStringSafe(row.cd_NI2_CODI, 6),
    cd_NI3_CODI: toStringSafe(row.cd_NI3_CODI, 6),
    cd_NI4_CODI: toStringSafe(row.cd_NI4_CODI, 6)
  };
}

function validateMappedRow(mapped, index) {
  if (!mapped.cd_ART_CODI) {
    throw new Error(`Fila ${index + 1}: cd_ART_CODI viene vacio.`);
  }
  if (!mapped.cd_ART_REFE) {
    throw new Error(`Fila ${index + 1}: cd_ART_REFE viene vacio.`);
  }
  if (!mapped.ds_ART_NOMB) {
    throw new Error(`Fila ${index + 1}: ds_ART_NOMB viene vacio.`);
  }
  if (mapped.am_ART_VCOS === null) {
    throw new Error(`Fila ${index + 1}: am_ART_VCOS no es numerico.`);
  }
  if (!mapped.cd_ART_TIPO) {
    throw new Error(`Fila ${index + 1}: cd_ART_TIPO viene vacio.`);
  }
  if (mapped.cd_ART_PREC === null) {
    throw new Error(`Fila ${index + 1}: cd_ART_PREC no es numerico.`);
  }
  if (!mapped.cd_IVA_CODI) {
    throw new Error(`Fila ${index + 1}: cd_IVA_CODI viene vacio.`);
  }
  if (!mapped.dt_ART_FCRE || !mapped.dt_ART_FMOD) {
    throw new Error(`Fila ${index + 1}: fecha de creacion o modificacion invalida.`);
  }
}

async function upsertArticuloMaestra(tx, rows) {
  const target = tableName(app.schema, app.itemTable);
  const stageTable = await getStageTableName(tx);
  const { validRows, invalidRows } = normalizeRows(rows);

  const stageRows = dedupeByCode(validRows);

  logger.info('Preparando carga de articulomaestra', {
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
      const mapped = mapItemRow(row);
      validateMappedRow(mapped, index);
      validRows.push(mapped);
    } catch (error) {
      invalidRows.push({ index: index + 1, reason: error.message });
    }
  });

  if (invalidRows.length > 0) {
    logger.info('Filas invalidas omitidas en articulomaestra', {
      count: invalidRows.length,
      sample: invalidRows.slice(0, 5)
    });
  }

  return { validRows, invalidRows };
}

function dedupeByCode(rows) {
  const unique = new Map();

  for (const row of rows) {
    unique.set(String(row.cd_ART_CODI), row);
  }

  return Array.from(unique.values());
}

async function getStageTableName(tx) {
  const req = createRequest(tx);
  const result = await req.query('SELECT @@SPID AS spid;');
  const spid = result.recordset?.[0]?.spid;
  return `##articulomaestra_stage_${spid}`;
}

async function createStageTable(tx, stageTable) {
  const req = createRequest(tx);
  await req.query(`
    IF OBJECT_ID('tempdb..${stageTable}') IS NOT NULL
      DROP TABLE ${stageTable};

    CREATE TABLE ${stageTable}
    (
      cd_ART_CODI VARCHAR(20) NOT NULL PRIMARY KEY,
      cd_ART_REFE VARCHAR(20) NOT NULL,
      ds_ART_NOMB VARCHAR(200) NOT NULL,
      am_ART_VCOS NUMERIC(12,2) NOT NULL,
      cd_ART_TIPO VARCHAR(1) NOT NULL,
      cd_ART_PREC NUMERIC(12,2) NOT NULL,
      cd_IVA_CODI VARCHAR(2) NOT NULL,
      dt_ART_FCRE DATE NOT NULL,
      dt_ART_FMOD DATE NOT NULL,
      cd_NI1_CODI VARCHAR(6) NOT NULL,
      cd_NI2_CODI VARCHAR(6) NOT NULL,
      cd_NI3_CODI VARCHAR(6) NOT NULL,
      cd_NI4_CODI VARCHAR(6) NOT NULL
    );
  `);
}

async function insertStageRows(tx, rows, stageTable) {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
    const req = createRequest(tx);

    const valuesSql = chunk.map((row, index) => {
      req.input(`cd_ART_CODI_${index}`, sql.VarChar(20), row.cd_ART_CODI);
      req.input(`cd_ART_REFE_${index}`, sql.VarChar(20), row.cd_ART_REFE);
      req.input(`ds_ART_NOMB_${index}`, sql.VarChar(200), row.ds_ART_NOMB);
      req.input(`am_ART_VCOS_${index}`, sql.Numeric(12, 2), row.am_ART_VCOS);
      req.input(`cd_ART_TIPO_${index}`, sql.VarChar(1), row.cd_ART_TIPO);
      req.input(`cd_ART_PREC_${index}`, sql.Numeric(12, 2), row.cd_ART_PREC);
      req.input(`cd_IVA_CODI_${index}`, sql.VarChar(2), row.cd_IVA_CODI);
      req.input(`dt_ART_FCRE_${index}`, sql.Date, row.dt_ART_FCRE);
      req.input(`dt_ART_FMOD_${index}`, sql.Date, row.dt_ART_FMOD);
      req.input(`cd_NI1_CODI_${index}`, sql.VarChar(6), row.cd_NI1_CODI);
      req.input(`cd_NI2_CODI_${index}`, sql.VarChar(6), row.cd_NI2_CODI);
      req.input(`cd_NI3_CODI_${index}`, sql.VarChar(6), row.cd_NI3_CODI);
      req.input(`cd_NI4_CODI_${index}`, sql.VarChar(6), row.cd_NI4_CODI);

      return `(
        @cd_ART_CODI_${index},
        @cd_ART_REFE_${index},
        @ds_ART_NOMB_${index},
        @am_ART_VCOS_${index},
        @cd_ART_TIPO_${index},
        @cd_ART_PREC_${index},
        @cd_IVA_CODI_${index},
        @dt_ART_FCRE_${index},
        @dt_ART_FMOD_${index},
        @cd_NI1_CODI_${index},
        @cd_NI2_CODI_${index},
        @cd_NI3_CODI_${index},
        @cd_NI4_CODI_${index}
      )`;
    }).join(',\n');

    await req.query(`
      INSERT INTO ${stageTable}
      (
        cd_ART_CODI,
        cd_ART_REFE,
        ds_ART_NOMB,
        am_ART_VCOS,
        cd_ART_TIPO,
        cd_ART_PREC,
        cd_IVA_CODI,
        dt_ART_FCRE,
        dt_ART_FMOD,
        cd_NI1_CODI,
        cd_NI2_CODI,
        cd_NI3_CODI,
        cd_NI4_CODI
      )
      VALUES
      ${valuesSql};
    `);

    logger.info('Bloque cargado a stage de articulomaestra', {
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
      target.cd_ART_REFE = stage.cd_ART_REFE,
      target.ds_ART_NOMB = stage.ds_ART_NOMB,
      target.am_ART_VCOS = stage.am_ART_VCOS,
      target.cd_ART_TIPO = stage.cd_ART_TIPO,
      target.cd_ART_PREC = stage.cd_ART_PREC,
      target.cd_IVA_CODI = stage.cd_IVA_CODI,
      target.dt_ART_FCRE = stage.dt_ART_FCRE,
      target.dt_ART_FMOD = stage.dt_ART_FMOD,
      target.cd_NI1_CODI = stage.cd_NI1_CODI,
      target.cd_NI2_CODI = stage.cd_NI2_CODI,
      target.cd_NI3_CODI = stage.cd_NI3_CODI,
      target.cd_NI4_CODI = stage.cd_NI4_CODI
    FROM ${target} AS target
    INNER JOIN ${stageTable} AS stage
      ON stage.cd_ART_CODI = target.cd_ART_CODI;

    SELECT @@ROWCOUNT AS updated;
  `);

  return result.recordset?.[0]?.updated || 0;
}

async function insertMissingRows(tx, target, stageTable) {
  const req = createRequest(tx);
  const result = await req.query(`
    INSERT INTO ${target}
    (
      cd_ART_CODI,
      cd_ART_REFE,
      ds_ART_NOMB,
      am_ART_VCOS,
      cd_ART_TIPO,
      cd_ART_PREC,
      cd_IVA_CODI,
      dt_ART_FCRE,
      dt_ART_FMOD,
      cd_NI1_CODI,
      cd_NI2_CODI,
      cd_NI3_CODI,
      cd_NI4_CODI
    )
    SELECT
      stage.cd_ART_CODI,
      stage.cd_ART_REFE,
      stage.ds_ART_NOMB,
      stage.am_ART_VCOS,
      stage.cd_ART_TIPO,
      stage.cd_ART_PREC,
      stage.cd_IVA_CODI,
      stage.dt_ART_FCRE,
      stage.dt_ART_FMOD,
      stage.cd_NI1_CODI,
      stage.cd_NI2_CODI,
      stage.cd_NI3_CODI,
      stage.cd_NI4_CODI
    FROM ${stageTable} AS stage
    LEFT JOIN ${target} AS target
      ON target.cd_ART_CODI = stage.cd_ART_CODI
    WHERE target.cd_ART_CODI IS NULL;

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

module.exports = { upsertArticuloMaestra, mapItemRow };
