export function isKarbandiRibArchEditorTarget(target) {
  if (typeof target?.closest !== 'function') return false;
  return Boolean(
    target.closest('[data-karbandi-arch]')
      && target.closest('input, select, textarea, [data-karbandi-input-control]'),
  );
}
