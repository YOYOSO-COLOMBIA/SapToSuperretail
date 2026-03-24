const { getPool, sql } = require('../config/sql');

async function testConnection() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT 1 AS ok');
  return result.recordset?.[0]?.ok === 1;
}

async function executeTransaction(work) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

function createRequest(tx) {
  return new sql.Request(tx);
}

function tableName(schema, name) {
  return `[${schema}].[${name}]`;
}

module.exports = {
  sql,
  testConnection,
  executeTransaction,
  createRequest,
  tableName
};
