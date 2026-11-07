// Signing out wipes this device's copy of the data, so it must wait for queued changes to be sent.
export const PENDING_MSG = 'Há alterações por enviar. Liga-te à internet e espera que terminem antes de terminar a sessão.';

// True when the store reports changes not yet sent; no store or no state means "not blocked".
export function signOutBlocked(store) {
  return store?.getState?.()?.pending === true;
}
