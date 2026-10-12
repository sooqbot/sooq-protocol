// Address-shaped strings: base58 (32-44, mixed case with a digit) and 0x + 40 hex.
// Never rejects a shape wholesale; every hit is matched against the stated registry.
const B58 = /(?<![A-Za-z0-9])(?=[1-9A-HJ-NP-Za-km-z]*\d)(?=[1-9A-HJ-NP-Za-km-z]*[a-z])(?=[1-9A-HJ-NP-Za-km-z]*[A-Z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const HEX = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;

export function addressShaped(text) {
  return [...(text.match(B58) || []), ...(text.match(HEX) || [])];
}

export function statedValues(reg) {
  return new Set(reg.records.filter((r) => r.state === 'stated').flatMap((r) => [r.value, r.url, r.rpc]).filter(Boolean));
}

/** Returns address-shaped strings that no stated record owns. The CA record is exempt by being in the registry. */
export function scanAddresses(text, reg) {
  const ok = statedValues(reg);
  return addressShaped(text).filter((a) => !ok.has(a));
}
