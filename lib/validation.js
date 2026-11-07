'use strict';
const { z } = require('zod');
const { ValidationError } = require('./errors');

// Convert Arabic-Indic / Persian digits to Western digits.
function westernDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);
}
const trimmed = (v) => (typeof v === 'string' ? westernDigits(v).trim() : v);
const emptyToNull = (v) => { const t = trimmed(v); return t === '' || t === undefined ? null : t; };
const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true || v === '1', z.boolean());

// Egyptian numbers: 01XXXXXXXXX -> +201XXXXXXXXX. International numbers must start with + or 00.
function normalizeMobile(v) {
  if (v === null || v === undefined) return v;
  let s = westernDigits(v).replace(/[\s\-().]/g, '');
  if (/^00\d+$/.test(s)) s = '+' + s.slice(2);
  if (/^01[0125]\d{8}$/.test(s)) s = '+2' + s;
  if (/^201[0125]\d{8}$/.test(s)) s = '+' + s;
  return s;
}
const mobile = z.preprocess(normalizeMobile, z.string().regex(/^\+[1-9]\d{7,14}$/, 'invalid_mobile')
  .refine((s) => !s.startsWith('+20') || /^\+201[0125]\d{8}$/.test(s), 'invalid_mobile'));
const optEmail = z.preprocess(emptyToNull, z.string().email('invalid_email').max(160).nullable());
const name = z.preprocess(trimmed, z.string().min(2, 'too_short').max(120, 'too_long'));
const optText = (max) => z.preprocess(emptyToNull, z.string().max(max, 'too_long').nullable());
const reqText = (min, max) => z.preprocess(trimmed, z.string().min(min, 'required').max(max, 'too_long'));
const intIn = (min, max) => z.preprocess((v) => (emptyToNull(v) === null ? undefined : Number(trimmed(v))), z.number({ error: 'required' }).int('invalid_number').min(min, 'out_of_range').max(max, 'out_of_range'));
const optIntIn = (min, max) => z.preprocess((v) => (emptyToNull(v) === null ? null : Number(trimmed(v))), z.number().int('invalid_number').min(min, 'out_of_range').max(max, 'out_of_range').nullable());
const money = z.preprocess((v) => (emptyToNull(v) === null ? undefined : Number(String(trimmed(v)).replace(/,/g, ''))),
  z.number({ error: 'required' }).finite('invalid_number').min(0, 'out_of_range').max(10000000, 'out_of_range')
    .refine((n) => Math.round(n * 100) === n * 100 || Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'invalid_number'));
const optMoney = z.preprocess((v) => (emptyToNull(v) === null ? null : Number(String(trimmed(v)).replace(/,/g, ''))),
  z.number().finite('invalid_number').min(0, 'out_of_range').max(1000000000, 'out_of_range').nullable());
const currency = z.preprocess((v) => String(trimmed(v) || 'EGP').toUpperCase(), z.string().regex(/^[A-Z]{3}$/, 'invalid_currency'));
const isoDate = z.preprocess(trimmed, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date').refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'invalid_date'));
const uuid = z.string().uuid('invalid_reference');
const optUuid = z.preprocess(emptyToNull, z.string().uuid('invalid_reference').nullable());
const enumOf = (vals) => z.preprocess(trimmed, z.enum(vals, { error: 'invalid_choice' }));
const optEnumOf = (vals) => z.preprocess(emptyToNull, z.enum(vals, { error: 'invalid_choice' }).nullable());

const thisYear = new Date().getFullYear();

const schemas = {
  customer: z.object({
    full_name: name,
    mobile,
    email: optEmail,
    preferred_locale: enumOf(['ar', 'en']).default('ar'),
    registration_date: isoDate.optional(),
    internal_notes: optText(2000),
  }),
  privacy: z.object({
    phone_visibility: enumOf(['public', 'private']),
    allow_contact_requests: checkbox,
    consent_method: enumOf(['in_person', 'phone_call', 'written_form', 'other']),
    evidence_note: optText(500),
  }),
  customerStatus: z.object({ status: enumOf(['active', 'inactive', 'archived']) }),
  vehicle: z.object({
    customer_id: uuid.optional(),
    make: reqText(1, 60),
    model: reqText(1, 60),
    model_year: intIn(1950, thisYear + 1),
    color: reqText(1, 40),
    category: enumOf(['sedan', 'hatchback', 'suv', 'crossover', 'coupe', 'convertible', 'pickup', 'van', 'minivan', 'wagon', 'other']),
    transmission: optEnumOf(['automatic', 'manual']),
    fuel_type: optEnumOf(['petrol', 'diesel', 'hybrid', 'electric', 'natural_gas']),
    mileage_km: optIntIn(0, 2000000),
    asking_price: optMoney,
    price_currency: currency,
    public_description: optText(600),
    show_mileage: checkbox,
    show_price: checkbox,
    listing_status: enumOf(['unlisted', 'listed', 'sold']),
  }),
  batch: z.object({
    name: reqText(2, 80),
    quantity: intIn(1, 5000),
    notes: optText(1000),
    request_token: uuid,
  }),
  assignQr: z.object({ serial: z.preprocess(trimmed, z.string().min(1, 'required').max(20)) }),
  qrReason: z.object({ reason: reqText(3, 300) }),
  sale: z.object({
    customer_id: uuid,
    vehicle_id: uuid,
    qr_code_id: optUuid,
    sale_date: isoDate,
    amount: money,
    currency,
    payment_status: enumOf(['pending', 'paid', 'refunded', 'cancelled']),
    channel: z.preprocess(trimmed, z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, 'invalid_choice')),
    responsible_user_id: optUuid,
    notes: optText(1000),
    request_token: uuid,
  }),
  saleLimited: z.object({
    payment_status: enumOf(['pending', 'paid', 'refunded', 'cancelled']),
    notes: optText(1000),
  }),
  user: z.object({
    full_name: name,
    email: z.preprocess(trimmed, z.string().email('invalid_email').max(160)),
    role: enumOf(['super_admin', 'admin', 'sales_operator']),
    password: z.string().min(12, 'password_too_short').max(200),
  }),
  userUpdate: z.object({
    full_name: name,
    role: enumOf(['super_admin', 'admin', 'sales_operator']),
    is_active: checkbox,
  }),
  passwordChange: z.object({
    current_password: z.string().min(1, 'required'),
    new_password: z.string().min(12, 'password_too_short').max(200),
    confirm_password: z.string(),
  }).refine((d) => d.new_password === d.confirm_password, { message: 'passwords_do_not_match', path: ['confirm_password'] }),
  login: z.object({ email: z.preprocess(trimmed, z.string().min(3).max(160)), password: z.string().min(1).max(200) }),
  layout: z.object({
    name: reqText(2, 80),
    page_width_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(50, 'out_of_range').max(1500, 'out_of_range')),
    page_height_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(50, 'out_of_range').max(1500, 'out_of_range')),
    columns: intIn(1, 20),
    rows: intIn(1, 20),
    margin_top_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(0, 'out_of_range').max(200, 'out_of_range')),
    margin_left_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(0, 'out_of_range').max(200, 'out_of_range')),
    gap_x_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(0, 'out_of_range').max(100, 'out_of_range')),
    gap_y_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(0, 'out_of_range').max(100, 'out_of_range')),
    bleed_mm: z.preprocess((v) => Number(trimmed(v)), z.number().min(0, 'out_of_range').max(10, 'out_of_range')),
    crop_marks: checkbox,
  }),
  contactRequest: z.object({
    visitor_name: z.preprocess(trimmed, z.string().min(2, 'too_short').max(80, 'too_long')),
    visitor_phone: mobile,
    message: z.preprocess(trimmed, z.string().min(2, 'too_short').max(600, 'too_long')),
    website: z.string().max(0).optional().or(z.literal('')), // honeypot
  }),
};

/** Parse with a schema; throws ValidationError with { field: 'validation.<code>' } map. */
function parse(schema, data) {
  const r = schema.safeParse(data || {});
  if (r.success) return r.data;
  const fieldErrors = {};
  for (const issue of r.error.issues) {
    const field = issue.path.join('.') || '_';
    if (fieldErrors[field]) continue;
    const code = /^[a-z_]+$/.test(issue.message) ? issue.message : (issue.code === 'invalid_type' ? 'required' : 'invalid_value');
    fieldErrors[field] = 'validation.' + code;
  }
  throw new ValidationError(fieldErrors);
}

module.exports = { schemas, parse, normalizeMobile, westernDigits };
