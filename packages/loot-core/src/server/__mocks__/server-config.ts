type ServerConfig = {
  BASE_SERVER: string;
  SYNC_SERVER: string;
  SIGNUP_SERVER: string;
  GOCARDLESS_SERVER: string;
  SIMPLEFIN_SERVER: string;
  PLUGGYAI_SERVER: string;
  ENABLEBANKING_SERVER: string;
};

let _baseURL = 'https://test.env';

function buildConfig(base: string): ServerConfig {
  return {
    BASE_SERVER: base,
    SYNC_SERVER: base + '/sync',
    SIGNUP_SERVER: base + '/account',
    GOCARDLESS_SERVER: base + '/gocardless',
    SIMPLEFIN_SERVER: base + '/simplefin',
    PLUGGYAI_SERVER: base + '/pluggyai',
    ENABLEBANKING_SERVER: base + '/enablebanking',
  };
}

export function isValidBaseURL(base: string): boolean {
  try {
    return Boolean(new URL(base));
  } catch {
    return false;
  }
}

export function setServer(url: string): void {
  _baseURL = url ?? 'https://test.env';
}

export function getServer(url?: string): ServerConfig | null {
  const base = url ?? _baseURL;
  if (!base) return null;
  return buildConfig(base);
}
