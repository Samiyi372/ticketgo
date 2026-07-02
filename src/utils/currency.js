export const CURRENCIES = [
  { code: "GBP", label: "英镑", symbol: "£" },
  { code: "EUR", label: "欧元", symbol: "€" },
  { code: "USD", label: "美元", symbol: "$" },
  { code: "CNY", label: "人民币", symbol: "¥" },
  { code: "JPY", label: "日元", symbol: "¥" },
  { code: "KRW", label: "韩元", symbol: "₩" },
  { code: "HKD", label: "港币", symbol: "HK$" },
  { code: "SGD", label: "新加坡元", symbol: "S$" },
  { code: "RUB", label: "俄罗斯卢布", symbol: "₽" },
];

export function getCurrencySymbol(code) {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "";
}
