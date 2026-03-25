const axios = require('axios');
const { sap } = require('../config/env');
const { buildHttpsAgent } = require('./sapAuth.service');
const logger = require('../utils/logger');

const PAGE_RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 1000;
const PAGE_PROGRESS_INTERVAL = 10;

function buildCollectionUrl(pathOrUrl, currentUrl) {
  const baseUrl = currentUrl || `${sap.baseUrl}/`;
  return new URL(pathOrUrl, baseUrl).toString();
}

function extractItems(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.value)) return body.value;
  if (Array.isArray(body?.d?.results)) return body.d.results;
  return [];
}

function extractNextLink(body) {
  return body?.['@odata.nextLink']
    || body?.['odata.nextLink']
    || body?.d?.__next
    || null;
}

function resolveLimits(maxRecords) {
  return {
    maxPages: sap.maxPages,
    maxRecords: maxRecords ?? sap.maxRecords
  };
}

function reachedLimit(pageCount, itemCount, limits) {
  return (limits.maxPages && pageCount >= limits.maxPages)
    || (limits.maxRecords && itemCount >= limits.maxRecords);
}

function trimToLimit(items, limits) {
  if (limits.maxRecords && items.length > limits.maxRecords) {
    return items.slice(0, limits.maxRecords);
  }

  return items;
}

async function fetchPage(pathOrUrl, cookieHeader, currentUrl) {
  const url = buildCollectionUrl(pathOrUrl, currentUrl);

  for (let attempt = 1; attempt <= PAGE_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await axios.get(url, {
        timeout: sap.timeoutMs,
        httpsAgent: buildHttpsAgent(),
        headers: {
          Cookie: cookieHeader,
          Accept: 'application/json'
        },
        validateStatus: () => true
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Error consultando ${pathOrUrl} (${response.status}): ${JSON.stringify(response.data)}`);
      }

      return {
        url,
        items: extractItems(response.data),
        nextLink: extractNextLink(response.data)
      };
    } catch (error) {
      if (attempt === PAGE_RETRY_LIMIT || !shouldRetry(error)) {
        throw error;
      }

      await delay(RETRY_DELAY_MS * attempt);
    }
  }
}

function shouldRetry(error) {
  return error.code === 'ECONNRESET'
    || error.code === 'ETIMEDOUT'
    || error.code === 'ECONNABORTED'
    || /timeout/i.test(error.message || '');
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildSkipUrl(templateUrl, skip) {
  const url = new URL(templateUrl.toString());
  url.searchParams.set('$skip', String(skip));
  url.searchParams.delete('$top');
  return url.toString();
}

function getParallelPaginationConfig(nextLink, currentUrl, pageSize) {
  if (!nextLink || !pageSize) return null;

  const nextUrl = new URL(nextLink, currentUrl);
  const startSkip = Number(nextUrl.searchParams.get('$skip'));

  if (!Number.isFinite(startSkip) || startSkip <= 0) {
    return null;
  }

  return {
    templateUrl: nextUrl,
    pageSize,
    startSkip
  };
}

async function fetchSequentialPages(initialPage, cookieHeader, limits) {
  const items = [...initialPage.items];
  let nextPathOrUrl = initialPage.nextLink;
  let currentUrl = initialPage.url;
  const visitedUrls = new Set([initialPage.url]);
  let pageCount = 1;

  while (nextPathOrUrl) {
    if (reachedLimit(pageCount, items.length, limits)) {
      logger.info('Limite de prueba SAP alcanzado', {
        pageCount,
        totalItems: items.length,
        maxPages: limits.maxPages,
        maxRecords: limits.maxRecords
      });
      break;
    }

    const page = await fetchPage(nextPathOrUrl, cookieHeader, currentUrl);

    if (visitedUrls.has(page.url)) {
      throw new Error(`Paginacion repetida detectada en SAP: ${page.url}`);
    }

    visitedUrls.add(page.url);
    items.push(...page.items);
    nextPathOrUrl = page.nextLink;
    currentUrl = page.url;
    pageCount += 1;

    if (pageCount % PAGE_PROGRESS_INTERVAL === 0) {
      logger.info('Avance SAP', { pageCount, totalItems: items.length });
    }
  }

  return trimToLimit(items, limits);
}

async function fetchParallelSkipPages(initialPage, cookieHeader, config, limits) {
  const items = [...initialPage.items];
  let skip = config.startSkip;
  let done = false;
  let pageCount = 1;
  const paginationConcurrency = Math.max(1, sap.paginationConcurrency || 1);

  while (!done) {
    if (reachedLimit(pageCount, items.length, limits)) {
      logger.info('Limite de prueba SAP alcanzado', {
        pageCount,
        totalItems: items.length,
        maxPages: limits.maxPages,
        maxRecords: limits.maxRecords
      });
      break;
    }

    const batchSkips = Array.from(
      { length: paginationConcurrency },
      (_, index) => skip + (index * config.pageSize)
    );

    const pages = await Promise.all(
      batchSkips.map(async (batchSkip) => {
        const page = await fetchPage(buildSkipUrl(config.templateUrl, batchSkip), cookieHeader);
        return { ...page, batchSkip };
      })
    );

    pages.sort((a, b) => a.batchSkip - b.batchSkip);

    for (const page of pages) {
      items.push(...page.items);
      pageCount += 1;

      if (page.items.length < config.pageSize || !page.nextLink) {
        done = true;
        break;
      }

      if (reachedLimit(pageCount, items.length, limits)) {
        done = true;
        break;
      }
    }

    if (pageCount % PAGE_PROGRESS_INTERVAL === 0 || done) {
      logger.info('Avance SAP', {
        pageCount,
        totalItems: items.length,
        nextSkip: skip,
        paginationConcurrency
      });
    }

    skip += paginationConcurrency * config.pageSize;
  }

  return trimToLimit(items, limits);
}

async function getCollection(path, cookieHeader, limits) {
  const firstPage = await fetchPage(path, cookieHeader);
  const parallelConfig = getParallelPaginationConfig(firstPage.nextLink, firstPage.url, firstPage.items.length);

  logger.info('Primera pagina SAP recibida', {
    path,
    pageSize: firstPage.items.length,
    hasNextPage: Boolean(firstPage.nextLink),
    paginationConcurrency: sap.paginationConcurrency
  });

  if (!parallelConfig) {
    const items = await fetchSequentialPages(firstPage, cookieHeader, limits);
    logger.info('Coleccion SAP completada', { path, totalItems: items.length });
    return items;
  }

  const items = await fetchParallelSkipPages(firstPage, cookieHeader, parallelConfig, limits);
  logger.info('Coleccion SAP completada', { path, totalItems: items.length });
  return items;
}

async function getSantaItem(cookieHeader) {
  return getCollection(sap.itemPath, cookieHeader, resolveLimits(sap.itemMaxRecords));
}

async function getSantaClient(cookieHeader) {
  return getCollection(sap.clientPath, cookieHeader, resolveLimits(sap.clientMaxRecords));
}

async function getSantaStock(cookieHeader) {
  return getCollection(sap.stockPath, cookieHeader, resolveLimits(sap.stockMaxRecords));
}

module.exports = {
  getSantaItem,
  getSantaClient,
  getSantaStock
};
