'use strict';
const express = require('express');
const customers = require('../../services/customers');
const db = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { serialRef } = require('../../lib/codes');
const { h, isUuid } = require('./_util');

const router = express.Router();
// Small JSON helpers for the sale form (customer picker → vehicles → sticker).
router.get('/customers', requirePerm('customers.view'), h(async (req, res) => {
  const rows = await customers.search(req.query.q, 10);
  res.json(rows.map((r) => ({ id: r.id, ref: r.customer_ref, name: r.full_name })));
}));
router.get('/customers/:id/vehicles', requirePerm('vehicles.view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return res.json([]);
  const { rows } = await db.query(
    `SELECT v.id, v.vehicle_ref, v.make, v.model, v.model_year,
            q.id AS qr_id, q.serial_no, q.status AS qr_status
       FROM vehicles v LEFT JOIN qr_codes q ON q.vehicle_id = v.id AND q.status IN ('assigned','active','suspended')
      WHERE v.customer_id = $1 ORDER BY v.created_at`, [req.params.id]);
  res.json(rows.map((r) => ({ id: r.id, ref: r.vehicle_ref, label: `${r.make} ${r.model} ${r.model_year}`, qr: r.qr_id ? { id: r.qr_id, serial: serialRef(r.serial_no), status: r.qr_status } : null })));
}));
module.exports = router;
