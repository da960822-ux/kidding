// This guard checks only unambiguous written numeric evidence; language interpretation stays with the provider.
export function guardQuantitySource(result, transcript) {
  if (!result?.quantity || typeof result.quantity !== 'object') return result;
  if (/취소|말고|아니|모르|몰라|미정|나중|인지|거나|씩|(?:상자|망|포대|자루|팩|바구니)(?:당|마다)|[~〜]|\d\s*-\s*\d/u.test(transcript)) return result;
  // Another nonnumeric unit phrase can be the target; an isolated numeric count may only be auxiliary.
  if (/(?<![\d가-힣])[가-힣]+\s*(?:킬로그램|바구니|포대|상자|자루|망|개|팩|kg)/u.test(transcript)) return result;
  // Do not parse a tail inside compound numerals such as 1천20 or 1만 2천.
  if (/\d\s*[십백천만억조]\s*\d/u.test(transcript)) return result;
  const matches = [...transcript.matchAll(/(?<![\d.,십백천만억조])([1-9]\d*)(?:\s*(만|천))?\s*(킬로그램|바구니|포대|상자|자루|망|개|팩|kg)/gu)];
  if (matches.length !== 1) return result;
  const [, number, scale, unit] = matches[0];
  const value = Number(number) * (scale === '만' ? 10000 : scale === '천' ? 1000 : 1);
  if (!Number.isSafeInteger(value) || (result.quantity.value === value && result.quantity.unit === unit)) return result;
  if (result.steps?.some((step) => step.task_code === null)) throw new TypeError('INVALID_STRUCTURE_V2_QUANTITY_SOURCE');
  return {
    ...result,
    interpretation: 'AMBIGUOUS',
    quantity: null,
    ambiguities: [
      ...(result.ambiguities ?? []).filter((item) => item.kind !== 'QUANTITY'),
      { field: 'quantity', message: '원문의 숫자와 단위가 해석된 수량과 다릅니다. 수량을 다시 확인해 주세요.', blocking: true, kind: 'QUANTITY' },
    ],
  };
}
