const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');

function mediosPagosTableName() {
  return tableName(app.schema, 'MEDIOSPAGOS');
}

async function getMediosPagoTickets(tx) {
  const req = createRequest(tx);

  const result = await req.query(`
    SELECT
      [cd_codigocliente],
      [dt_diaoperativo],
      [ds_tipoevento],
      [cd_codigotienda],
      [cd_codigocaja],
      [ds_numerotiquete],
      [cd_codigomedio],
      [am_valor],
      [cd_codigocuenta]
    FROM ${mediosPagosTableName()}
    ORDER BY
      [dt_diaoperativo],
      [cd_codigocliente],
      [ds_numerotiquete],
      [cd_codigomedio];
  `);

  return groupRowsByTicket(result.recordset || []);
}

function groupRowsByTicket(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const exactKey = buildExactKey(row);
    const relaxedKey = buildRelaxedKey(row);
    const payment = {
      paymentMethodCode: cleanValue(row.cd_codigomedio),
      cashAccount: cleanValue(row.cd_codigocuenta),
      amount: Number(row.am_valor)
    };

    if (!grouped.has(exactKey)) {
      grouped.set(exactKey, {
        exactKey,
        relaxedKey,
        cardCode: cleanValue(row.cd_codigocliente),
        docDate: toSqlDate(row.dt_diaoperativo),
        eventType: normalizeLooseCode(row.ds_tipoevento),
        storeCode: cleanValue(row.cd_codigotienda),
        cashRegisterCode: cleanValue(row.cd_codigocaja),
        ticketNumber: cleanValue(row.ds_numerotiquete),
        payments: [payment]
      });
      continue;
    }

    grouped.get(exactKey).payments.push(payment);
  }

  return [...grouped.values()];
}

function buildExactKey(row) {
  return [
    cleanValue(row.cd_codigocliente),
    toSqlDate(row.dt_diaoperativo),
    normalizeLooseCode(row.ds_tipoevento),
    normalizeLooseCode(row.cd_codigotienda),
    normalizeLooseCode(row.cd_codigocaja),
    normalizeLooseCode(row.ds_numerotiquete)
  ].join('|');
}

function buildRelaxedKey(row) {
  return [
    cleanValue(row.cd_codigocliente),
    toSqlDate(row.dt_diaoperativo),
    normalizeLooseCode(row.ds_numerotiquete)
  ].join('|');
}

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeLooseCode(value) {
  const text = cleanValue(value);
  if (!text) return '';

  if (/^\d+$/.test(text)) {
    return String(Number(text));
  }

  return text.toUpperCase();
}

function toSqlDate(value) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  getMediosPagoTickets,
  buildRelaxedKey,
  buildExactKey,
  normalizeLooseCode
};
