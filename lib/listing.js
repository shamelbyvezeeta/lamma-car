'use strict';
// Shared helpers for server-side search / filter / sort / pagination.
const PAGE_SIZE = 20;

function pageParams(query, sortMap, defaultSort) {
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1));
  const sortKey = Object.prototype.hasOwnProperty.call(sortMap, query.sort) ? query.sort : defaultSort;
  const dir = query.dir === 'asc' ? 'ASC' : query.dir === 'desc' ? 'DESC' : (sortMap[sortKey].dir || 'DESC');
  return { page, pageSize: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, orderBy: `${sortMap[sortKey].col} ${dir} NULLS LAST`, sortKey, dir: dir.toLowerCase() };
}

// Escape LIKE wildcards in user search input.
function likeTerm(q) {
  const s = String(q || '').trim().slice(0, 100);
  return s ? '%' + s.replace(/[\\%_]/g, (m) => '\\' + m) + '%' : null;
}

function pager(total, page, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { total, page: Math.min(page, pages), pages, pageSize, from: total ? (page - 1) * pageSize + 1 : 0, to: Math.min(total, page * pageSize) };
}

class Where {
  constructor() { this.parts = []; this.params = []; }
  add(sqlWithQ, ...vals) {
    let s = sqlWithQ;
    for (const v of vals) { this.params.push(v); s = s.replace('?', '$' + this.params.length); }
    this.parts.push(s);
    return this;
  }
  get sql() { return this.parts.length ? 'WHERE ' + this.parts.join(' AND ') : ''; }
  next() { return '$' + (this.params.length + 1); }
}

module.exports = { pageParams, likeTerm, pager, Where, PAGE_SIZE };
