'use strict';
const { ValidationError } = require('../../lib/errors');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Render a form again with field errors (422) or rethrow. */
function formFail(res, view, locals) {
  return (e) => {
    if (e instanceof ValidationError) return res.status(422).render(view, { ...locals, errors: e.fieldErrors });
    if (e && e.status && e.status < 500 && e.key) return res.status(e.status).render(view, { ...locals, errors: {}, formErrorKey: e.key, formErrorParams: e.params });
    throw e;
  };
}

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));

module.exports = { h, formFail, isUuid };
