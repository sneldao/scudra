// Shared types for the Blindspot investigation pipeline.

export interface EnsRecord {
  name: string
  address: string
  avatar: string | null
  website: string | null
  twitter: string | null
  github: string | null
  discord: string | null
  email: string | null
  description: string | null
  /** Other ENS names that resolve to the same address (reverse lookup). */
  aliases: string[]
}

export interface MobulaAsset {
  asset: {
    id: number
    name: string
    symbol: string
    contract: string
    blockchain: string
    logo: string | null
    price: number | null
    marketCap: number | null
    liquidity: number | null
  }
  walletBalance: number
  walletBalanceRaw: string
  amountUSD: number
}

export interface MobulaPosition {
  token: {
    name: string
    symbol: string
    contract: string
    blockchain: string
    logo: string | null
    price: number | null
    liquidity: number | null
  }
  balance: number
  amountUSD: number
  buys: number
  sells: number
  buyVolumeUSD: number
  sellVolumeUSD: number
  realizedPnlUSD: number
  unrealizedPnlUSD: number
  totalPnlUSD: number
  firstActivity: string | null
  lastActivity: string | null
}

export interface MobulaData {
  portfolio: MobulaAsset[]
  positions: MobulaPosition[]
  totalValueUSD: number
  totalRealizedPnlUSD: number
  totalUnrealizedPnlUSD: number
}

export interface OffChainContext {
  url: string
  title: string
  description: string
  ogImage: string | null
  socialLinks: string[]
  rawSnippet: string
  fetchedVia: string // "stealth-proxy:us" etc.
  egressIp: string
}

export interface RiskAssessment {
  overallScore: number // 0-100, higher = riskier
  signals: RiskSignal[]
  summary: string
  /**
   * The figures the signals above rely on, carried on the assessment.
   *
   * A signal that cites a number must be able to show which number it used,
   * so the receipt can recompute it from the raw records and check the two
   * agree. These are the metrics, not prose.
   */
  totalRealizedPnlUSD: number
  totalUnrealizedPnlUSD: number
  topHoldingShare: number
  lowLiquidityCount: number
  buyOnlyCount: number
  aliasCount: number
  unreachableSourceCount: number
}

export interface RiskSignal {
  category: string
  label: string
  severity: "low" | "medium" | "high"
  detail: string
}

export interface PrivacyManifest {
  protectedData: string[]
  adversaries: string[]
  mechanisms: string[]
  sandboxId: string
  browserSessionId: string
  egressIp: string
  sandboxDestroyed: boolean
  recordingAvailable: boolean
}

export interface InvestigationReport {
  target: EnsRecord
  onchain: MobulaData
  offChain: OffChainContext[]
  risk: RiskAssessment
  privacy: PrivacyManifest
  timestamp: string
  duration: number
}
