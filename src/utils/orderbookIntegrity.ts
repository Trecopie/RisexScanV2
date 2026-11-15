/** Exact 18-decimal wei-string conversion from RISEx decimal L2 frames for CRC32-IEEE validation.
 * Pure string/BigInt math avoids JS float rounding errors on price keys and quantities. */
export interface RawBook {
  bids: Map<string, string>;
  asks: Map<string, string>;
}
export interface RawBookMessage {
  channel?: unknown;
  type?: unknown;
  market_id?: unknown;
  checksum?: unknown;
  data?: {
    market_id?: unknown;
    bids?: unknown;
    asks?: unknown;
  };
}
export type RawBookFrame = {
  marketId: string;
  isSnapshot: boolean;
  bids: Array<{price:string;quantity:string}>;
  asks: Array<{price:string;quantity:string}>;
  checksum: number | null;
};

export function decimalToWeiString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const [intPart, frac = ''] = trimmed.split('.');
  const scaled = (intPart || '0') + frac.padEnd(18, '0').slice(0, 18);
  return BigInt(scaled).toString();
}

export function readRawOrderbookFrame(message: RawBookMessage): RawBookFrame | null {
  if (!message || message.channel !== 'orderbook' || !message.data) return null;
  const marketId = String(message.data.market_id ?? message.market_id ?? '');
  if (!/^\d+$/.test(marketId) || (message.type !== 'snapshot' && message.type !== 'update')) return null;
  const levels = (raw: unknown): Array<{price:string;quantity:string}> | null => {
    if (!Array.isArray(raw)) return null;
    const out: Array<{price:string;quantity:string}> = [];
    for (const value of raw) {
      if (!value || typeof value !== 'object') return null;
      const item = value as Record<string, unknown>;
      const price = decimalToWeiString(item.price);
      const quantity = decimalToWeiString(item.quantity);
      if (price === null || quantity === null) return null;
      out.push({price,quantity});
    }
    return out;
  };
  const bids=levels(message.data.bids),asks=levels(message.data.asks);
  if (!bids || !asks) return null;
  const checksum = Number.isInteger(message.checksum) && Number(message.checksum) >= 0
    ? Number(message.checksum) >>> 0 : null;
  return {marketId,isSnapshot:message.type === 'snapshot',bids,asks,checksum};
}

export function emptyRawBook(): RawBook {
  return {bids:new Map(), asks:new Map()};
}

export function applyRawBookFrame(book: RawBook, frame: RawBookFrame): void {
  if (frame.isSnapshot) {book.bids.clear();book.asks.clear();}
  for (const [target, changes] of [[book.bids,frame.bids],[book.asks,frame.asks]] as const) {
    for (const {price,quantity} of changes) {
      if (BigInt(quantity) === 0n) target.delete(price);
      else target.set(price,quantity);
    }
  }
}

export function crc32Ascii(value:string):number {
  let crc=0xFFFFFFFF;
  for(let i=0;i<value.length;i++){
    crc ^= value.charCodeAt(i);
    for(let b=0;b<8;b++) crc=(crc>>>1) ^ ((crc&1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF)>>>0;
}

/** CRC covers every visible price level in exact source wei units. */
export function risexBookChecksum(book:RawBook):number {
  const bids=[...book.bids].sort((a,b)=>BigInt(a[0]) > BigInt(b[0]) ? -1 : 1);
  const asks=[...book.asks].sort((a,b)=>BigInt(a[0]) < BigInt(b[0]) ? -1 : 1);
  const parts:string[]=[];
  for(let i=0;i<Math.max(bids.length,asks.length);i++){
    if(bids[i])parts.push(bids[i][0],bids[i][1]);
    if(asks[i])parts.push(asks[i][0],asks[i][1]);
  }
  return crc32Ascii(parts.join(':'));
}

export function rawBookIntegrityOk(book:RawBook,frame:RawBookFrame):boolean {
  // RISEx snapshots legitimately have no checksum. Updates always specify one.
  // Never call an unverified update an integrity-checked live orderbook.
  if (frame.isSnapshot) return true;
  return frame.checksum !== null && risexBookChecksum(book) === frame.checksum;
}
