/** 第一區財務總覽：一律顯示正數金額（流水帳仍保留正負號） */
export function displayMoney(n: number): number {
  return Math.abs(Math.round(n));
}
