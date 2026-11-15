import { shortAddress } from './format';

export const RISEX_VAULT_ADDRESS = '0x938a104179a2d23dec249a968ecd5b4f8b857cac';
export const RISEX_VAULT_DISPLAY_NAME = 'RISEx Vault';
export const RISEX_VAULT_BADGE_LABEL = 'Protocol Vault';

export interface TraderDisplayInfo {
  displayName: string;
  rawAlias: string | null;
  badgeLabel: string | null;
  isVault: boolean;
}

export function isVaultWallet(address?: string | null, username?: string | null): boolean {
  const cleanAddr = (address || '').trim().toLowerCase();
  const cleanUser = (username || '').trim().toLowerCase();
  return (
    cleanAddr === RISEX_VAULT_ADDRESS ||
    cleanUser === 'mmadapter' ||
    cleanUser === 'risex vault'
  );
}

export function formatTraderDisplay(
  address: string,
  username?: string | null
): TraderDisplayInfo {
  if (isVaultWallet(address, username)) {
    return {
      displayName: RISEX_VAULT_DISPLAY_NAME,
      rawAlias: username && username.trim().toLowerCase() !== 'risex vault' ? username.trim() : 'mmAdapter',
      badgeLabel: RISEX_VAULT_BADGE_LABEL,
      isVault: true,
    };
  }
  const cleanUser = username?.trim() || null;
  return {
    displayName: cleanUser || shortAddress(address),
    rawAlias: null,
    badgeLabel: null,
    isVault: false,
  };
}

export function matchesTraderQuery(
  trader: {
    address: string;
    username?: string | null;
    xHandle?: string | null;
  },
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (trader.address.toLowerCase().includes(q)) return true;
  if (trader.username && trader.username.toLowerCase().includes(q)) return true;
  if (trader.xHandle && trader.xHandle.toLowerCase().includes(q)) return true;
  if (isVaultWallet(trader.address, trader.username)) {
    return (
      'risex vault'.includes(q) ||
      'protocol vault'.includes(q) ||
      'mmadapter'.includes(q) ||
      q === 'vault'
    );
  }
  return false;
}
