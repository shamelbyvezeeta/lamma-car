'use strict';
const db = require('../db');
const fmt = require('../lib/format');
const { serialRef, qrUrl } = require('../lib/codes');

// Each report: columns (key, label i18n key, width weight, align) + rows loader.
// `ctx` = { user, locale, t, filters }.
const REPORTS = {
  customers: {
    title: 'reports.customers',
    async rows(ctx) {
      const { rows } = await db.query(
        `SELECT c.customer_ref, c.full_name, c.mobile, c.email, c.status, c.phone_visibility, c.allow_contact_requests, c.registration_date, c.is_test_data,
                (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id)::int AS vehicles,
                (SELECT count(*) FROM qr_codes q WHERE q.customer_id = c.id AND q.status = 'active')::int AS active_stickers
           FROM customers c ORDER BY c.customer_ref`);
      // Bulk contact data is restricted: only Super Admins export full mobile numbers.
      const full = ctx.user.role === 'super_admin';
      return rows.map((r) => ({ ...r, mobile: full ? r.mobile : fmt.maskPhone(r.mobile) }));
    },
    columns: (t) => [
      { key: 'customer_ref', label: t('fields.ref'), w: 1 },
      { key: 'full_name', label: t('fields.full_name'), w: 2.2 },
      { key: 'mobile', label: t('fields.mobile'), w: 1.6, ltr: true },
      { key: 'status', label: t('fields.status'), w: 1, value: (r) => t('customer_status.' + r.status) },
      { key: 'phone_visibility', label: t('fields.phone_visibility'), w: 1.3, value: (r) => t('visibility.' + r.phone_visibility) },
      { key: 'allow_contact_requests', label: t('fields.contact_requests'), w: 1, value: (r) => t(r.allow_contact_requests ? 'common.yes' : 'common.no') },
      { key: 'registration_date', label: t('fields.registration_date'), w: 1.2 },
      { key: 'vehicles', label: t('nav.vehicles'), w: 0.8, align: 'end' },
      { key: 'active_stickers', label: t('fields.active_stickers'), w: 0.9, align: 'end' },
    ],
  },
  vehicles: {
    title: 'reports.vehicles',
    async rows() {
      const { rows } = await db.query(
        `SELECT v.vehicle_ref, c.customer_ref, c.full_name AS customer_name, v.make, v.model, v.model_year, v.color, v.category, v.listing_status,
                (SELECT serial_no FROM qr_codes q WHERE q.vehicle_id = v.id AND q.status IN ('assigned','active','suspended') LIMIT 1) AS serial_no,
                (SELECT status FROM qr_codes q WHERE q.vehicle_id = v.id AND q.status IN ('assigned','active','suspended') LIMIT 1) AS qr_status
           FROM vehicles v JOIN customers c ON c.id = v.customer_id ORDER BY v.vehicle_ref`);
      return rows;
    },
    columns: (t) => [
      { key: 'vehicle_ref', label: t('fields.ref'), w: 1 },
      { key: 'customer_ref', label: t('fields.customer'), w: 1 },
      { key: 'make', label: t('fields.make'), w: 1.2 },
      { key: 'model', label: t('fields.model'), w: 1.2 },
      { key: 'model_year', label: t('fields.model_year'), w: 0.7 },
      { key: 'color', label: t('fields.color'), w: 0.9 },
      { key: 'category', label: t('fields.category'), w: 1, value: (r) => t('category.' + r.category) },
      { key: 'listing_status', label: t('fields.listing_status'), w: 1, value: (r) => t('listing.' + r.listing_status) },
      { key: 'serial_no', label: t('fields.sticker'), w: 1, value: (r) => (r.serial_no ? serialRef(r.serial_no) : '—') },
      { key: 'qr_status', label: t('fields.qr_status'), w: 1, value: (r) => (r.qr_status ? t('qr_status.' + r.qr_status) : '—') },
    ],
  },
  qr_codes: {
    title: 'reports.qr_codes',
    async rows(ctx) {
      const params = [];
      let where = '';
      if (ctx.filters.batch && /^B-\d{4}-\d{4}$/.test(ctx.filters.batch)) { params.push(ctx.filters.batch); where = 'WHERE b.batch_ref = $1'; }
      const { rows } = await db.query(
        `SELECT q.serial_no, q.public_code, q.status, b.batch_ref, c.customer_ref, v.vehicle_ref, q.created_at, q.assigned_at, q.activated_at, q.deactivated_at
           FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id LEFT JOIN customers c ON c.id = q.customer_id LEFT JOIN vehicles v ON v.id = q.vehicle_id
           ${where} ORDER BY q.serial_no`, params);
      return rows;
    },
    columns: (t, l) => [
      { key: 'serial_no', label: t('fields.serial'), w: 1, value: (r) => serialRef(r.serial_no) },
      { key: 'public_code', label: t('fields.public_code'), w: 1.3, ltr: true },
      { key: 'url', label: t('fields.qr_url'), w: 2.6, ltr: true, value: (r) => qrUrl(r.public_code), csvOnly: false },
      { key: 'batch_ref', label: t('fields.batch'), w: 1.1 },
      { key: 'status', label: t('fields.status'), w: 1, value: (r) => t('qr_status.' + r.status) },
      { key: 'customer_ref', label: t('fields.customer'), w: 0.9 },
      { key: 'vehicle_ref', label: t('fields.vehicle'), w: 0.9 },
      { key: 'activated_at', label: t('fields.activated_at'), w: 1.2, value: (r) => (r.activated_at ? fmt.date(r.activated_at, l) : '—') },
    ],
  },
  batches: {
    title: 'reports.batches',
    async rows() {
      const { rows } = await db.query(
        `SELECT b.batch_ref, b.name, b.quantity, b.status, b.created_at, u.full_name AS created_by_name,
                count(*) FILTER (WHERE q.status = 'available')::int AS available,
                count(*) FILTER (WHERE q.status = 'assigned')::int AS assigned,
                count(*) FILTER (WHERE q.status = 'active')::int AS active,
                count(*) FILTER (WHERE q.status = 'suspended')::int AS suspended,
                count(*) FILTER (WHERE q.status = 'deactivated')::int AS deactivated
           FROM qr_batches b LEFT JOIN app_users u ON u.id = b.created_by LEFT JOIN qr_codes q ON q.batch_id = b.id
          GROUP BY b.id, u.full_name ORDER BY b.batch_ref`);
      return rows;
    },
    columns: (t, l) => [
      { key: 'batch_ref', label: t('fields.ref'), w: 1.1 },
      { key: 'name', label: t('fields.name'), w: 2 },
      { key: 'quantity', label: t('fields.quantity'), w: 0.8, align: 'end' },
      { key: 'status', label: t('fields.status'), w: 0.9, value: (r) => t('batch_status.' + r.status) },
      { key: 'created_at', label: t('fields.created_at'), w: 1.1, value: (r) => fmt.date(r.created_at, l) },
      { key: 'created_by_name', label: t('fields.created_by'), w: 1.4 },
      { key: 'available', label: t('qr_status.available'), w: 0.8, align: 'end' },
      { key: 'assigned', label: t('qr_status.assigned'), w: 0.8, align: 'end' },
      { key: 'active', label: t('qr_status.active'), w: 0.8, align: 'end' },
      { key: 'suspended', label: t('qr_status.suspended'), w: 0.8, align: 'end' },
      { key: 'deactivated', label: t('qr_status.deactivated'), w: 0.9, align: 'end' },
    ],
  },
  sales: {
    title: 'reports.sales',
    async rows(ctx) { return require('./sales').exportRows(ctx.filters); },
    columns: (t, l) => [
      { key: 'sale_ref', label: t('fields.ref'), w: 0.9 },
      { key: 'sale_date', label: t('fields.sale_date'), w: 1 },
      { key: 'customer_name', label: t('fields.customer'), w: 1.8 },
      { key: 'vehicle', label: t('fields.vehicle'), w: 1.8, value: (r) => `${r.make} ${r.model} ${r.model_year}` },
      { key: 'serial_no', label: t('fields.sticker'), w: 0.9, value: (r) => (r.serial_no ? serialRef(r.serial_no) : '—') },
      { key: 'batch_ref', label: t('fields.batch'), w: 1, value: (r) => r.batch_ref || '—' },
      { key: 'amount', label: t('fields.amount'), w: 1.1, align: 'end', ltr: true, value: (r) => Number(r.amount).toFixed(2) },
      { key: 'currency', label: t('fields.currency'), w: 0.6 },
      { key: 'payment_status', label: t('fields.payment_status'), w: 0.9, value: (r) => t('payment.' + r.payment_status) },
      { key: 'channel', label: t('fields.channel'), w: 0.9, value: (r) => (l === 'ar' ? r.channel_ar : r.channel_en) || r.channel },
      { key: 'responsible_name', label: t('fields.responsible'), w: 1.3 },
      { key: 'notes', label: t('fields.notes'), w: 1.5, csvOnly: true },
    ],
  },
  revenue: {
    title: 'reports.revenue',
    async rows() {
      const { rows } = await db.query(
        `SELECT to_char(date_trunc('month', sale_date), 'YYYY-MM') AS month, currency,
                count(*) FILTER (WHERE payment_status <> 'cancelled')::int AS sales,
                count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_sales,
                COALESCE(sum(amount) FILTER (WHERE payment_status = 'paid'), 0) AS paid,
                COALESCE(sum(amount) FILTER (WHERE payment_status = 'pending'), 0) AS pending,
                COALESCE(sum(amount) FILTER (WHERE payment_status = 'refunded'), 0) AS refunded
           FROM sales GROUP BY 1, 2 ORDER BY 1 DESC, 2`);
      return rows;
    },
    columns: (t) => [
      { key: 'month', label: t('fields.month'), w: 1 },
      { key: 'currency', label: t('fields.currency'), w: 0.8 },
      { key: 'sales', label: t('fields.sales_count'), w: 1, align: 'end' },
      { key: 'paid_sales', label: t('fields.paid_sales'), w: 1, align: 'end' },
      { key: 'paid', label: t('fields.revenue_paid'), w: 1.4, align: 'end', ltr: true, value: (r) => Number(r.paid).toFixed(2) },
      { key: 'pending', label: t('payment.pending'), w: 1.4, align: 'end', ltr: true, value: (r) => Number(r.pending).toFixed(2) },
      { key: 'refunded', label: t('payment.refunded'), w: 1.4, align: 'end', ltr: true, value: (r) => Number(r.refunded).toFixed(2) },
    ],
  },
  activation: {
    title: 'reports.activation',
    async rows() {
      const { rows } = await db.query(
        `SELECT b.batch_ref, b.name, b.quantity,
                count(*) FILTER (WHERE q.customer_id IS NOT NULL)::int AS assigned_ever,
                count(*) FILTER (WHERE q.activated_at IS NOT NULL)::int AS activated_ever,
                count(*) FILTER (WHERE q.status = 'active')::int AS active_now,
                round(avg(EXTRACT(epoch FROM (q.activated_at - q.assigned_at)) / 86400.0) FILTER (WHERE q.activated_at IS NOT NULL)::numeric, 1) AS avg_days_to_activate
           FROM qr_batches b LEFT JOIN qr_codes q ON q.batch_id = b.id GROUP BY b.id ORDER BY b.batch_ref`);
      return rows.map((r) => ({ ...r, activation_rate: r.quantity ? ((r.activated_ever / r.quantity) * 100).toFixed(1) + '%' : '—' }));
    },
    columns: (t) => [
      { key: 'batch_ref', label: t('fields.batch'), w: 1.1 },
      { key: 'name', label: t('fields.name'), w: 2 },
      { key: 'quantity', label: t('fields.quantity'), w: 0.9, align: 'end' },
      { key: 'assigned_ever', label: t('fields.assigned_ever'), w: 1, align: 'end' },
      { key: 'activated_ever', label: t('fields.activated_ever'), w: 1, align: 'end' },
      { key: 'active_now', label: t('fields.active_now'), w: 1, align: 'end' },
      { key: 'activation_rate', label: t('fields.activation_rate'), w: 1, align: 'end' },
      { key: 'avg_days_to_activate', label: t('fields.avg_days_to_activate'), w: 1.3, align: 'end', value: (r) => r.avg_days_to_activate ?? '—' },
    ],
  },
};

module.exports = { REPORTS };
