-- Lamma Car — initial schema
-- PostgreSQL 14+ (developed and tested on 16)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
CREATE TYPE user_role          AS ENUM ('super_admin', 'admin', 'sales_operator');
CREATE TYPE customer_status    AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE phone_visibility   AS ENUM ('not_set', 'public', 'private');
CREATE TYPE consent_type       AS ENUM ('phone_visibility', 'contact_requests', 'data_processing');
CREATE TYPE consent_method     AS ENUM ('in_person', 'phone_call', 'written_form', 'other');
CREATE TYPE listing_status     AS ENUM ('unlisted', 'listed', 'sold');
CREATE TYPE batch_status       AS ENUM ('generated', 'released', 'closed');
CREATE TYPE qr_status          AS ENUM ('generated', 'available', 'assigned', 'active', 'suspended', 'deactivated');
CREATE TYPE payment_status     AS ENUM ('pending', 'paid', 'refunded', 'cancelled');
CREATE TYPE contact_req_status AS ENUM ('new', 'relayed', 'closed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION trg_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

-- ---------------------------------------------------------------------------
-- Users & sessions
-- ---------------------------------------------------------------------------
CREATE TABLE app_users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL UNIQUE CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name             text   NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  role                  user_role NOT NULL,
  password_hash         text   NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT true,
  failed_login_count    integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  preferred_locale      text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
  created_by            uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER app_users_updated BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Session store (connect-pg-simple layout)
CREATE TABLE http_sessions (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX http_sessions_expire_idx ON http_sessions (expire);

-- ---------------------------------------------------------------------------
-- Customers, consent, vehicles
-- ---------------------------------------------------------------------------
CREATE SEQUENCE customer_ref_seq START 1;
CREATE TABLE customers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ref            text NOT NULL UNIQUE DEFAULT ('C-' || lpad(nextval('customer_ref_seq')::text, 6, '0')),
  full_name               text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  mobile                  text NOT NULL CHECK (mobile ~ '^\+[1-9][0-9]{7,14}$'),
  email                   citext CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_locale        text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
  status                  customer_status NOT NULL DEFAULT 'active',
  -- Privacy: 'not_set' is treated exactly like 'private' everywhere.
  phone_visibility        phone_visibility NOT NULL DEFAULT 'not_set',
  allow_contact_requests  boolean NOT NULL DEFAULT false,
  registration_date       date NOT NULL DEFAULT current_date,
  internal_notes          text CHECK (internal_notes IS NULL OR length(internal_notes) <= 2000),
  is_test_data            boolean NOT NULL DEFAULT false,
  created_by              uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_mobile_uq ON customers (mobile);
CREATE INDEX customers_name_idx ON customers (lower(full_name));
CREATE INDEX customers_status_idx ON customers (status);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE consent_records (
  id            bigserial PRIMARY KEY,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  consent_type  consent_type NOT NULL,
  value         text NOT NULL CHECK (length(value) <= 40),
  method        consent_method NOT NULL,
  evidence_note text CHECK (evidence_note IS NULL OR length(evidence_note) <= 500),
  recorded_by   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_records_customer_idx ON consent_records (customer_id, recorded_at DESC);
CREATE TRIGGER consent_records_append_only BEFORE UPDATE OR DELETE ON consent_records FOR EACH ROW EXECUTE FUNCTION trg_append_only();

CREATE SEQUENCE vehicle_ref_seq START 1;
CREATE TABLE vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_ref        text NOT NULL UNIQUE DEFAULT ('V-' || lpad(nextval('vehicle_ref_seq')::text, 6, '0')),
  customer_id        uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  make               text NOT NULL CHECK (length(btrim(make)) BETWEEN 1 AND 60),
  model              text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 60),
  model_year         integer NOT NULL CHECK (model_year BETWEEN 1950 AND 2100),
  color              text NOT NULL CHECK (length(btrim(color)) BETWEEN 1 AND 40),
  category           text NOT NULL CHECK (category IN ('sedan','hatchback','suv','crossover','coupe','convertible','pickup','van','minivan','wagon','other')),
  transmission       text CHECK (transmission IS NULL OR transmission IN ('automatic','manual')),
  fuel_type          text CHECK (fuel_type IS NULL OR fuel_type IN ('petrol','diesel','hybrid','electric','natural_gas')),
  mileage_km         integer CHECK (mileage_km IS NULL OR mileage_km BETWEEN 0 AND 2000000),
  asking_price       numeric(14,2) CHECK (asking_price IS NULL OR asking_price >= 0),
  price_currency     char(3) NOT NULL DEFAULT 'EGP' CHECK (price_currency ~ '^[A-Z]{3}$'),
  public_description text CHECK (public_description IS NULL OR length(public_description) <= 600),
  show_mileage       boolean NOT NULL DEFAULT false,
  show_price         boolean NOT NULL DEFAULT false,
  listing_status     listing_status NOT NULL DEFAULT 'unlisted',
  photo_key          text CHECK (photo_key IS NULL OR photo_key ~ '^[a-f0-9]{32}\.webp$'),
  photo_approved     boolean NOT NULL DEFAULT false,
  is_test_data       boolean NOT NULL DEFAULT false,
  created_by         uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, customer_id)
);
CREATE INDEX vehicles_customer_idx ON vehicles (customer_id);
CREATE INDEX vehicles_make_model_idx ON vehicles (lower(make), lower(model));
CREATE TRIGGER vehicles_updated BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- A vehicle can never move to another customer (keeps QR/sales history truthful).
CREATE OR REPLACE FUNCTION trg_vehicle_owner_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'vehicle owner cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vehicles_owner_immutable BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION trg_vehicle_owner_immutable();

-- ---------------------------------------------------------------------------
-- Batches & QR codes
-- ---------------------------------------------------------------------------
CREATE TABLE qr_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref     text NOT NULL UNIQUE CHECK (batch_ref ~ '^B-[0-9]{4}-[0-9]{4}$'),
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  quantity      integer NOT NULL CHECK (quantity BETWEEN 1 AND 5000),
  status        batch_status NOT NULL DEFAULT 'generated',
  notes         text CHECK (notes IS NULL OR length(notes) <= 1000),
  request_token uuid UNIQUE,                         -- idempotency key from the create form
  created_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz,
  released_by   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qr_batches_name_uq ON qr_batches (lower(name));
CREATE TRIGGER qr_batches_updated BEFORE UPDATE ON qr_batches FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE SEQUENCE qr_serial_seq START 1;
CREATE TABLE qr_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code    text NOT NULL UNIQUE CHECK (public_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$'),
  serial_no      bigint NOT NULL UNIQUE DEFAULT nextval('qr_serial_seq'),
  batch_id       uuid NOT NULL REFERENCES qr_batches(id) ON DELETE RESTRICT,
  status         qr_status NOT NULL DEFAULT 'generated',
  customer_id    uuid REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id     uuid,
  assigned_at    timestamptz,
  assigned_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  activated_at   timestamptz,
  activated_by   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  suspended_at   timestamptz,
  deactivated_at timestamptz,
  status_reason  text CHECK (status_reason IS NULL OR length(status_reason) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles (id, customer_id) ON DELETE RESTRICT,
  CONSTRAINT qr_unassigned_states_have_no_owner CHECK (
    status NOT IN ('generated','available') OR (customer_id IS NULL AND vehicle_id IS NULL)),
  CONSTRAINT qr_live_states_have_owner CHECK (
    status NOT IN ('assigned','active','suspended') OR (customer_id IS NOT NULL AND vehicle_id IS NOT NULL AND assigned_at IS NOT NULL)),
  CONSTRAINT qr_active_has_activation CHECK (status <> 'active' OR activated_at IS NOT NULL)
);
CREATE INDEX qr_codes_batch_status_idx ON qr_codes (batch_id, status);
CREATE INDEX qr_codes_status_idx ON qr_codes (status);
CREATE INDEX qr_codes_customer_idx ON qr_codes (customer_id);
-- At most one live sticker per vehicle (replacement = deactivate old, assign new).
CREATE UNIQUE INDEX qr_codes_one_live_per_vehicle ON qr_codes (vehicle_id) WHERE status IN ('assigned','active','suspended');
CREATE TRIGGER qr_codes_updated BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- State machine + "never reuse" rules, enforced in the database regardless of caller.
CREATE OR REPLACE FUNCTION trg_qr_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.public_code <> OLD.public_code OR NEW.serial_no <> OLD.serial_no OR NEW.batch_id <> OLD.batch_id THEN
    RAISE EXCEPTION 'QR identity fields are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'QR code can never be reassigned to another customer' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.vehicle_id IS NOT NULL AND NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    RAISE EXCEPTION 'QR code can never be moved to another vehicle' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status <> OLD.status THEN
    ok := (OLD.status, NEW.status) IN (
      ('generated'::qr_status, 'available'::qr_status),
      ('generated', 'deactivated'),
      ('available', 'assigned'),
      ('available', 'deactivated'),
      ('assigned',  'active'),
      ('assigned',  'deactivated'),
      ('active',    'suspended'),
      ('active',    'deactivated'),
      ('suspended', 'active'),
      ('suspended', 'deactivated'));
    IF NOT ok THEN
      RAISE EXCEPTION 'invalid QR status transition % -> %', OLD.status, NEW.status USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qr_codes_guard BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION trg_qr_guard();

CREATE OR REPLACE FUNCTION trg_qr_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'QR codes are never deleted; deactivate instead' USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER qr_codes_no_delete BEFORE DELETE ON qr_codes FOR EACH ROW EXECUTE FUNCTION trg_qr_no_delete();

CREATE TABLE qr_status_history (
  id          bigserial PRIMARY KEY,
  qr_code_id  uuid NOT NULL REFERENCES qr_codes(id) ON DELETE RESTRICT,
  from_status qr_status,
  to_status   qr_status NOT NULL,
  reason      text,
  actor_id    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qr_status_history_qr_idx ON qr_status_history (qr_code_id, created_at DESC);
CREATE TRIGGER qr_status_history_append_only BEFORE UPDATE OR DELETE ON qr_status_history FOR EACH ROW EXECUTE FUNCTION trg_append_only();

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
CREATE TABLE sales_channels (
  code       text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name_ar    text NOT NULL,
  name_en    text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE SEQUENCE sale_ref_seq START 1;
CREATE TABLE sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_ref            text NOT NULL UNIQUE DEFAULT ('S-' || lpad(nextval('sale_ref_seq')::text, 6, '0')),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id          uuid NOT NULL,
  qr_code_id          uuid REFERENCES qr_codes(id) ON DELETE RESTRICT,
  batch_id            uuid REFERENCES qr_batches(id) ON DELETE RESTRICT,
  sale_date           date NOT NULL,
  amount              numeric(14,2) NOT NULL CHECK (amount >= 0 AND amount <= 10000000),
  currency            char(3) NOT NULL DEFAULT 'EGP' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_status      payment_status NOT NULL DEFAULT 'pending',
  channel             text NOT NULL REFERENCES sales_channels(code) ON UPDATE CASCADE,
  responsible_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  notes               text CHECK (notes IS NULL OR length(notes) <= 1000),
  request_token       uuid UNIQUE,
  created_by          uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles (id, customer_id) ON DELETE RESTRICT
);
CREATE INDEX sales_date_idx ON sales (sale_date DESC);
CREATE INDEX sales_status_idx ON sales (payment_status);
CREATE INDEX sales_customer_idx ON sales (customer_id);
CREATE INDEX sales_batch_idx ON sales (batch_id);
CREATE TRIGGER sales_updated BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- A sale's QR code must belong to the same customer & vehicle; batch is derived from the QR code.
CREATE OR REPLACE FUNCTION trg_sales_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q record;
BEGIN
  IF NEW.qr_code_id IS NULL THEN
    NEW.batch_id := NULL;
  ELSE
    SELECT customer_id, vehicle_id, batch_id INTO q FROM qr_codes WHERE id = NEW.qr_code_id;
    IF q.customer_id IS DISTINCT FROM NEW.customer_id OR q.vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
      RAISE EXCEPTION 'QR code is not assigned to this customer/vehicle' USING ERRCODE = 'P0001';
    END IF;
    NEW.batch_id := q.batch_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_consistency BEFORE INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION trg_sales_consistency();

-- ---------------------------------------------------------------------------
-- Public contact requests (alternative contact channel, off by default)
-- ---------------------------------------------------------------------------
CREATE TABLE contact_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id    uuid NOT NULL REFERENCES qr_codes(id) ON DELETE RESTRICT,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id    uuid NOT NULL,
  visitor_name  text NOT NULL CHECK (length(btrim(visitor_name)) BETWEEN 2 AND 80),
  visitor_phone text NOT NULL CHECK (visitor_phone ~ '^\+[1-9][0-9]{7,14}$'),
  message       text NOT NULL CHECK (length(btrim(message)) BETWEEN 2 AND 600),
  status        contact_req_status NOT NULL DEFAULT 'new',
  ip_hash       text,
  handled_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  handled_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles (id, customer_id) ON DELETE RESTRICT
);
CREATE INDEX contact_requests_status_idx ON contact_requests (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Print layouts, settings, audit
-- ---------------------------------------------------------------------------
CREATE TABLE sheet_layouts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  page_width_mm     numeric(6,1) NOT NULL CHECK (page_width_mm BETWEEN 50 AND 1500),
  page_height_mm    numeric(6,1) NOT NULL CHECK (page_height_mm BETWEEN 50 AND 1500),
  columns           integer NOT NULL CHECK (columns BETWEEN 1 AND 20),
  rows              integer NOT NULL CHECK (rows BETWEEN 1 AND 20),
  margin_top_mm     numeric(5,1) NOT NULL DEFAULT 10 CHECK (margin_top_mm >= 0),
  margin_left_mm    numeric(5,1) NOT NULL DEFAULT 10 CHECK (margin_left_mm >= 0),
  gap_x_mm          numeric(5,1) NOT NULL DEFAULT 6 CHECK (gap_x_mm >= 0),
  gap_y_mm          numeric(5,1) NOT NULL DEFAULT 6 CHECK (gap_y_mm >= 0),
  bleed_mm          numeric(4,1) NOT NULL DEFAULT 2 CHECK (bleed_mm BETWEEN 0 AND 10),
  crop_marks        boolean NOT NULL DEFAULT true,
  is_default        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sheet_layouts_one_default ON sheet_layouts (is_default) WHERE is_default;

CREATE TABLE system_settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  actor_id     uuid REFERENCES app_users(id) ON DELETE SET NULL,
  actor_label  text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION trg_append_only();

-- ---------------------------------------------------------------------------
-- Public read model. The ONLY function the public landing page uses.
-- Returns nothing unless the code exists AND is active; returns the mobile number
-- only when the owner explicitly chose 'public'. Never returns internal UUIDs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_qr_card(p_code text)
RETURNS TABLE (
  qr_status          qr_status,
  make               text,
  model              text,
  model_year         integer,
  color              text,
  category           text,
  transmission       text,
  fuel_type          text,
  mileage_km         integer,
  asking_price       numeric,
  price_currency     char(3),
  public_description text,
  listing_status     listing_status,
  photo_key          text,
  public_phone       text,
  contact_requests   boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.status,
         CASE WHEN q.status = 'active' THEN v.make END,
         CASE WHEN q.status = 'active' THEN v.model END,
         CASE WHEN q.status = 'active' THEN v.model_year END,
         CASE WHEN q.status = 'active' THEN v.color END,
         CASE WHEN q.status = 'active' THEN v.category END,
         CASE WHEN q.status = 'active' AND v.listing_status = 'listed' THEN v.transmission END,
         CASE WHEN q.status = 'active' AND v.listing_status = 'listed' THEN v.fuel_type END,
         CASE WHEN q.status = 'active' AND v.listing_status = 'listed' AND v.show_mileage THEN v.mileage_km END,
         CASE WHEN q.status = 'active' AND v.listing_status = 'listed' AND v.show_price THEN v.asking_price END,
         CASE WHEN q.status = 'active' THEN v.price_currency END,
         CASE WHEN q.status = 'active' AND v.listing_status = 'listed' THEN v.public_description END,
         CASE WHEN q.status = 'active' THEN v.listing_status END,
         CASE WHEN q.status = 'active' AND v.photo_approved THEN v.photo_key END,
         CASE WHEN q.status = 'active' AND c.status = 'active' AND c.phone_visibility = 'public' THEN c.mobile END,
         CASE WHEN q.status = 'active' AND c.status = 'active' THEN c.allow_contact_requests ELSE false END
  FROM qr_codes q
  LEFT JOIN vehicles  v ON v.id = q.vehicle_id
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.public_code = upper(p_code)
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
INSERT INTO sales_channels (code, name_ar, name_en, sort_order) VALUES
  ('direct',   'مبيعات مباشرة', 'Direct sale', 1),
  ('showroom', 'معرض',          'Showroom',    2),
  ('event',    'فعالية',        'Event',       3),
  ('partner',  'شريك',          'Partner',     4),
  ('online',   'أونلاين',       'Online',      5);

INSERT INTO sheet_layouts (name, page_width_mm, page_height_mm, columns, rows, margin_top_mm, margin_left_mm, gap_x_mm, gap_y_mm, bleed_mm, crop_marks, is_default) VALUES
  ('A4 portrait — 2 × 2 (90 × 130 mm)', 210, 297, 2, 2, 12, 9, 12, 12, 2, true, true),
  ('A3 portrait — 3 × 3 (90 × 130 mm)', 297, 420, 3, 3, 10, 6.5, 6, 6, 2, true, false),
  ('Single sticker per page (print shop / plotter)', 98, 138, 1, 1, 4, 4, 0, 0, 2, true, false);

INSERT INTO system_settings (key, value) VALUES
  ('landing.show_category',         'true'::jsonb),
  ('landing.show_vehicle_photo',    'true'::jsonb),
  ('landing.show_extended_details', 'true'::jsonb),
  ('contact.requests_enabled',      'false'::jsonb),
  ('sales.default_currency',        '"EGP"'::jsonb),
  ('sales.default_amount',          'null'::jsonb),
  ('support.public_phone',          'null'::jsonb),
  ('support.public_email',          'null'::jsonb);
