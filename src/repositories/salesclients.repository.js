const { createRequest, tableName, sql } = require('../services/sql.service');
const { app } = require('../config/env');

const SELECT_CHUNK_SIZE = 500;

function salesClientsTableName() {
  return tableName(app.schema, app.salesClientsTable);
}

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeStatus(value) {
  const text = cleanValue(value);
  if (!text) return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function mapSalesClientRow(row) {
  return {
    cardCode: cleanValue(row.cd_codigocliente),
    cardName: cleanValue(row.ds_nombrecliente),
    phone: cleanValue(row.ds_telefonocliente),
    cellular: cleanValue(row.ds_celularcliente),
    email: cleanValue(row.ds_emailcliente),
    regTrib: cleanValue(row.cd_regimentributario),
    tipDoc: cleanValue(row.cd_tipodocumento),
    regFis: cleanValue(row.cd_regimenfiscal),
    cityCode: cleanValue(row.cd_codigociudad),
    tipEnt: cleanValue(row.cd_tipoentrada),
    status: normalizeStatus(row.ds_estado)
  };
}

async function getSalesClientsByCodes(tx, codes) {
  const uniqueCodes = Array.from(new Set((codes || []).map(cleanValue).filter(Boolean)));
  const resultMap = new Map();

  for (let offset = 0; offset < uniqueCodes.length; offset += SELECT_CHUNK_SIZE) {
    const chunk = uniqueCodes.slice(offset, offset + SELECT_CHUNK_SIZE);
    const req = createRequest(tx);

    const placeholders = chunk.map((code, index) => {
      req.input(`code_${offset + index}`, sql.VarChar(20), code);
      return `@code_${offset + index}`;
    }).join(', ');

    const result = await req.query(`
      SELECT
        [cd_codigocliente],
        [ds_nombrecliente],
        [ds_telefonocliente],
        [ds_celularcliente],
        [ds_emailcliente],
        [cd_regimentributario],
        [cd_tipodocumento],
        [cd_regimenfiscal],
        [cd_codigociudad],
        [cd_tipoentrada],
        [ds_estado]
      FROM ${salesClientsTableName()}
      WHERE [cd_codigocliente] IN (${placeholders});
    `);

    for (const row of result.recordset || []) {
      const mapped = mapSalesClientRow(row);
      resultMap.set(mapped.cardCode, mapped);
    }
  }

  return resultMap;
}

async function markSalesClientAsSent(tx, cardCode) {
  const normalizedCardCode = cleanValue(cardCode);
  const req = createRequest(tx);
  req.input('cardCode', sql.VarChar(20), normalizedCardCode);

  await req.query(`
    UPDATE ${salesClientsTableName()}
    SET [ds_estado] = 0
    WHERE [cd_codigocliente] = @cardCode;
  `);
}

module.exports = {
  getSalesClientsByCodes,
  markSalesClientAsSent
};
