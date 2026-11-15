import test from 'node:test';
import assert from 'node:assert/strict';
import { curatedAssetLogoUrl } from './TokenBadge.tsx';

test('curated icon registry serves known symbols across sectors and avoids wrong asset mappings', () => {
  assert.match(curatedAssetLogoUrl('BTC/USDC', 'crypto') || '', /coins\/64x64\/1\.png$/);
  assert.match(curatedAssetLogoUrl('HYPE/USDC', 'crypto') || '', /coins\/64x64\/32196\.png$/);
  assert.match(curatedAssetLogoUrl('LIT/USDC', 'crypto') || '', /coins\/64x64\/39125\.png$/);
  assert.match(curatedAssetLogoUrl('CHIP/USDC', 'crypto') || '', /coins\/64x64\/39870\.png$/);
  assert.match(curatedAssetLogoUrl('NVDA/USDC', 'stocks') || '', /nvidia--big\.svg$/);
  assert.match(curatedAssetLogoUrl('SPY/USDC', 'index_etf') || '', /s-and-p-500--big\.svg$/);
  assert.match(curatedAssetLogoUrl('XAU/USDC', 'commodity') || '', /gold--big\.svg$/);
  assert.match(curatedAssetLogoUrl('ARM/USDC', 'stocks') || '', /arm--big\.svg$/);
  assert.equal(curatedAssetLogoUrl('SOMEUNKNOWN/USDC', 'crypto'), null);
  assert.equal(curatedAssetLogoUrl('BTC', 'stocks'), null);
});
