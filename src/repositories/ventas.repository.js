const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');

function ventasTableName() {
  return tableName(app.schema, 'VENTAS');
}

async function getVentasTickets(tx) {
  const req = createRequest(tx);

  const result = await req.query(`
    SELECT
      [cd_codigocliente],
      [dt_diaoperativo],
      [ds_tipoevento],
      [cd_codigotienda],
      [cd_codigocaja],
      [ds_numerotiquete],
      [ds_observacionventa],
      [cd_codigoarticulo],
      [am_cantidadarticulo],
      [am_valorunitario],
      [cd_codigoiva],
      [cd_centrocosto],
      [cd_subcentrocosto]
    FROM ${ventasTableName()}
    ORDER BY
      [dt_diaoperativo],
      [cd_codigotienda],
      [cd_codigocaja],
      [ds_numerotiquete],
      [cd_codigoarticulo];
  `);

  return groupRowsByTicket(result.recordset || []);
}

function groupRowsByTicket(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const ticketKey = buildTicketKey(row);
    const line = {
      itemCode: cleanValue(row.cd_codigoarticulo),
      quantity: Number(row.am_cantidadarticulo),
      unitPrice: Number(row.am_valorunitario),
      taxCode: cleanValue(row.cd_codigoiva),
      costingCode: cleanValue(row.cd_centrocosto),
      costingCode2: cleanValue(row.cd_subcentrocosto),
      warehouseCode: cleanValue(row.cd_codigotienda)
    };

    if (!grouped.has(ticketKey)) {
      grouped.set(ticketKey, {
        ticketKey,
        cardCode: cleanValue(row.cd_codigocliente),
        docDate: toSqlDate(row.dt_diaoperativo),
        eventType: cleanValue(row.ds_tipoevento),
        storeCode: cleanValue(row.cd_codigotienda),
        cashRegisterCode: cleanValue(row.cd_codigocaja),
        ticketNumber: cleanValue(row.ds_numerotiquete),
        comments: cleanValue(row.ds_observacionventa),
        lines: [line]
      });
      continue;
    }

    grouped.get(ticketKey).lines.push(line);
  }

  return [...grouped.values()];
}

function buildTicketKey(row) {
  return [
    cleanValue(row.cd_codigocliente),
    toSqlDate(row.dt_diaoperativo),
    cleanValue(row.ds_tipoevento),
    cleanValue(row.cd_codigotienda),
    cleanValue(row.cd_codigocaja),
    cleanValue(row.ds_numerotiquete)
  ].join('|');
}

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
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
  getVentasTickets
};
