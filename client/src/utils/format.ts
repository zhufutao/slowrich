export function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatMoney(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(2)}亿`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(2)}万`;
  }
  return formatNumber(value);
}

export function formatVolume(volume: number): string {
  if (volume >= 100000000) {
    return `${(volume / 100000000).toFixed(2)}亿股`;
  }
  if (volume >= 10000) {
    return `${(volume / 10000).toFixed(2)}万股`;
  }
  return `${volume}股`;
}

export function formatDate(dateStr: string): string {
  return dateStr;
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pctChgColor(value: number): string {
  if (value > 0) return 'text-rise';
  if (value < 0) return 'text-fall';
  return 'text-flat';
}

export function getTemperatureColor(value: number): string {
  if (value <= 20) return 'text-temp-cold';
  if (value <= 35) return 'text-temp-cool';
  if (value <= 50) return 'text-temp-moderate';
  if (value <= 70) return 'text-temp-warm';
  return 'text-temp-hot';
}

export function getTemperatureBgColor(value: number): string {
  if (value <= 20) return 'bg-temp-cold';
  if (value <= 35) return 'bg-temp-cool';
  if (value <= 50) return 'bg-temp-moderate';
  if (value <= 70) return 'bg-temp-warm';
  return 'bg-temp-hot';
}

export function getMarketEnvBadge(env: string): string {
  switch (env) {
    case '牛市': return 'bg-rise/10 text-rise';
    case '熊市': return 'bg-fall/10 text-fall';
    default: return 'bg-flat/10 text-flat';
  }
}
