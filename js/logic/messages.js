const MESSAGES = {
  'auth/invalid-credential': 'Email ou palavra-passe errados.',
  'auth/wrong-password': 'Email ou palavra-passe errados.',
  'auth/user-not-found': 'Email ou palavra-passe errados.',
  'auth/invalid-email': 'O email não é válido.',
  'auth/too-many-requests': 'Demasiadas tentativas. Espera um pouco.',
  'auth/network-request-failed': 'Sem ligação à internet.',
  'permission-denied': 'Sem permissão para aceder aos dados. Volta a entrar na conta.',
  'unavailable': 'Sem ligação ao servidor. As alterações são enviadas quando a ligação voltar.',
  'auth/missing-email': 'Escreve o teu email.',
};

export function authMessage(code) {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : 'Ocorreu um erro inesperado. Tenta de novo.';
}
