const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const PH_MOBILE_PATTERN = /^(\+?63|0)9\d{9}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Email is required.';
  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address.';
  return null;
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return 'Username is required.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 30) return 'Username must be 30 characters or fewer.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use only lowercase letters, numbers, and underscores (no spaces or symbols).';
  }
  return null;
}

export function validateFullName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return 'Enter your full name.';
  if (name.length > 100) return 'Full name must be 100 characters or fewer.';
  return null;
}

export function validatePhone(value: string): string | null {
  if (!value.trim()) return null;
  if (!PH_MOBILE_PATTERN.test(normalizePhone(value))) {
    return 'Enter a valid Philippine mobile number, such as 09XX XXX XXXX.';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[a-z]/.test(value)) return 'Include at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Include at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Include at least one number.';
  return null;
}

export function getPasswordStrength(value: string): { score: number; label: string } {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (score <= 2) return { score, label: 'Weak' };
  if (score <= 3) return { score, label: 'Fair' };
  if (score === 4) return { score, label: 'Good' };
  return { score, label: 'Strong' };
}
