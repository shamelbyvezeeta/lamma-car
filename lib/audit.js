'use strict';
const db = require('../db');

/** Append an audit log entry. `client` may be a transaction client or omitted. */
async function log(client, { actor, action, entityType = null, entityId = null, details = {}, req = null }) {
  const q = client || db;
  const ip = req ? (req.ip || null) : null;
  const ua = req ? String(req.get('user-agent') || '').slice(0, 300) : null;
  await q.query(
    `INSERT INTO audit_logs (actor_id, actor_label, action, entity_type, entity_id, details, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actor ? actor.id : null, actor ? actor.email : 'system', action, entityType, entityId ? String(entityId) : null,
      JSON.stringify(details || {}), ip && /^[0-9a-f:.]+$/i.test(ip) ? ip : null, ua]
  );
}

module.exports = { log };
