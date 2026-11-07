/* GitHub Pages serves 404.html for every unknown URL. If the code was typed in lower case or with
   look-alike letters (o/O→0, i/I/l/L→1), send the visitor to the correctly spelled page once. */
(function () {
  var s = document.currentScript; var base = (s && s.getAttribute('data-base')) || '';
  var path = location.pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  var m = /^\/q\/([^\/]+)(\/en)?\/?$/i.exec(path);
  if (!m) return;
  var raw = decodeURIComponent(m[1]);
  var norm = raw.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  if (/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(norm) && norm !== raw) {
    location.replace(base + '/q/' + norm + '/' + (m[2] ? 'en/' : ''));
  }
})();
