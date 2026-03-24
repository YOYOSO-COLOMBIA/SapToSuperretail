function now() {
  return new Date().toISOString();
}

function info(message, data) {
  if (data !== undefined) {
    console.log(`[${now()}] INFO  ${message}`, data);
    return;
  }
  console.log(`[${now()}] INFO  ${message}`);
}

function error(message, data) {
  if (data !== undefined) {
    console.error(`[${now()}] ERROR ${message}`, data);
    return;
  }
  console.error(`[${now()}] ERROR ${message}`);
}

module.exports = { info, error };
