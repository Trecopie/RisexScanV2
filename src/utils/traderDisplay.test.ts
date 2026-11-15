import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RISEX_VAULT_ADDRESS,
  formatTraderDisplay,
  isVaultWallet,
  matchesTraderQuery,
} from './traderDisplay';

test('identifies and formats the #1 protocol vault wallet as RISEx Vault', () => {
  assert.equal(isVaultWallet('0x938a104179a2D23DeC249A968ecd5B4F8B857cac', 'mmAdapter'), true);
  assert.equal(isVaultWallet('0x1234567890123456789012345678901234567890', 'mmAdapter'), true);
  assert.equal(isVaultWallet('0x1234567890123456789012345678901234567890', 'alice'), false);

  const info = formatTraderDisplay('0x938a104179a2D23DeC249A968ecd5B4F8B857cac', 'mmAdapter');
  assert.equal(info.isVault, true);
  assert.equal(info.displayName, 'RISEx Vault');
  assert.equal(info.badgeLabel, 'Protocol Vault');
  assert.equal(info.rawAlias, 'mmAdapter');

  const regular = formatTraderDisplay('0x228e195eb98faa456b17c2d285495a3bee22765e', 'danny');
  assert.equal(regular.isVault, false);
  assert.equal(regular.displayName, 'danny');
  assert.equal(regular.badgeLabel, null);
});

test('matchesTraderQuery finds RISEx Vault by display name, vault keyword, alias, and address', () => {
  const vault = {
    address: RISEX_VAULT_ADDRESS,
    username: 'mmAdapter',
    xHandle: null,
  };
  assert.equal(matchesTraderQuery(vault, 'RISEx Vault'), true);
  assert.equal(matchesTraderQuery(vault, 'vault'), true);
  assert.equal(matchesTraderQuery(vault, 'mmAdapter'), true);
  assert.equal(matchesTraderQuery(vault, '0x938a104'), true);
  assert.equal(matchesTraderQuery(vault, 'unrelated'), false);
});
