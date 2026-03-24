require('dotenv').config();

function bool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function num(value, defaultValue = null) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

module.exports = {
  sap: {
    baseUrl: process.env.SAP_BASE_URL,
    companyDb: process.env.SAP_COMPANY_DB,
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD,
    loginPath: process.env.SAP_LOGIN_PATH || '/b1s/v1/Login',
    itemPath: process.env.SAP_ITEM_PATH || '/b1s/v2/sml.svc/SANTAITEM',
    clientPath: process.env.SAP_CLIENT_PATH || '/b1s/v2/sml.svc/SANTACLIENT',
    stockPath: process.env.SAP_STOCK_PATH || '/b1s/v2/sml.svc/SANTASTOCK',
    timeoutMs: Number(process.env.SAP_TIMEOUT_MS || 120000),
    rejectUnauthorized: bool(process.env.SAP_REJECT_UNAUTHORIZED, false),
    maxPages: num(process.env.SAP_MAX_PAGES, null),
    maxRecords: num(process.env.SAP_MAX_RECORDS, null),
    itemMaxRecords: num(process.env.SAP_ITEM_MAX_RECORDS, null),
    clientMaxRecords: num(process.env.SAP_CLIENT_MAX_RECORDS, null),
    stockMaxRecords: num(process.env.SAP_STOCK_MAX_RECORDS, null)
  },
  sql: {
    server: process.env.SQL_SERVER,
    port: Number(process.env.SQL_PORT || 1433),
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    connectionTimeout: Number(process.env.SQL_CONNECTION_TIMEOUT_MS || 30000),
    requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT_MS || 120000),
    options: {
      encrypt: bool(process.env.SQL_ENCRYPT, false),
      trustServerCertificate: bool(process.env.SQL_TRUST_SERVER_CERT, true)
    }
  },
  app: {
    schema: process.env.SQL_SCHEMA || 'Yoyoso',
    logTable: process.env.LOG_TABLE || 'LOG_CARGA_SAP',
    itemTable: process.env.ITEM_TABLE || 'articulomaestra',
    stockTable: process.env.STOCK_TABLE || 'stockarticulos',
    clientTable: process.env.CLIENT_TABLE || 'clientemaestra',
    syncItemsOnly: bool(process.env.SYNC_ITEMS_ONLY, false),
    syncStockOnly: bool(process.env.SYNC_STOCK_ONLY, false),
    syncClientsOnly: bool(process.env.SYNC_CLIENTS_ONLY, false),
    validationOnly: bool(process.env.VALIDATION_ONLY, false),
    port: Number(process.env.PORT || 8080),
    runToken: process.env.RUN_TOKEN || '',
    autoRunOnStart: bool(process.env.AUTO_RUN_ON_START, false)
  }
};
