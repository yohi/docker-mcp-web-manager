/**
 * Bot検出と保護機能
 * 
 * 機能要件：
 * - User-Agent 分析
 * - リクエストパターン分析
 * - 行動パターン検出
 * - レート制限連携
 * - ハニーポット実装
 * - CAPTCHAチャレンジ
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * Bot検出結果
 */
export interface BotDetectionResult {
  isBot: boolean
  confidence: number // 0-1の信頼度
  reasons: string[]
  shouldBlock: boolean
  shouldChallenge: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * リクエスト分析データ
 */
interface RequestAnalysis {
  userAgent: UserAgentAnalysis
  headers: HeaderAnalysis
  timing: TimingAnalysis
  behavior: BehaviorAnalysis
}

/**
 * User-Agent 分析結果
 */
interface UserAgentAnalysis {
  isKnownBot: boolean
  isSuspicious: boolean
  browserInfo: {
    name: string
    version: string
    os: string
  } | null
  botType?: 'search-engine' | 'social-media' | 'malicious' | 'scraper' | 'monitoring'
}

/**
 * ヘッダー分析結果
 */
interface HeaderAnalysis {
  hasStandardHeaders: boolean
  hasJavaScript: boolean
  acceptsHtml: boolean
  suspiciousHeaders: string[]
  missingHeaders: string[]
}

/**
 * タイミング分析結果
 */
interface TimingAnalysis {
  requestsPerSecond: number
  averageInterval: number
  isRapidFire: boolean
  isPerfectTiming: boolean
}

/**
 * 行動分析結果
 */
interface BehaviorAnalysis {
  hasInteraction: boolean
  sequentialRequests: boolean
  coversAllEndpoints: boolean
  ignoresRobotsTxt: boolean
}

/**
 * Bot検出エンジン
 */
class BotDetectionEngine {
  private requestHistory: Map<string, Array<{
    timestamp: number
    path: string
    userAgent: string
    headers: Record<string, string>
  }>> = new Map()

  private knownBots = {
    good: [
      'googlebot',
      'bingbot',
      'slurp', // Yahoo
      'facebookexternalhit',
      'twitterbot',
      'linkedinbot',
      'whatsapp',
      'telegram',
      'discord',
    ],
    suspicious: [
      'curl',
      'wget',
      'python-requests',
      'go-http-client',
      'java/',
      'apache-httpclient',
      'okhttp',
      'node-fetch',
    ],
    malicious: [
      'masscan',
      'zmap',
      'nmap',
      'sqlmap',
      'nikto',
      'burpsuite',
      'scrapy',
      'selenium',
      'puppeteer',
      'phantomjs',
    ]
  }

  /**
   * メイン検出ロジック
   */
  async detectBot(request: NextRequest): Promise<BotDetectionResult> {
    const clientId = this.getClientId(request)
    const analysis = await this.analyzeRequest(request, clientId)
    
    let confidence = 0
    const reasons: string[] = []
    let riskLevel: BotDetectionResult['riskLevel'] = 'low'

    // User-Agent 分析
    if (analysis.userAgent.isKnownBot) {
      if (this.knownBots.malicious.some(bot => 
        request.headers.get('user-agent')?.toLowerCase().includes(bot)
      )) {
        confidence += 0.8
        reasons.push('Known malicious bot detected')
        riskLevel = 'critical'
      } else if (this.knownBots.good.some(bot => 
        request.headers.get('user-agent')?.toLowerCase().includes(bot)
      )) {
        confidence += 0.3
        reasons.push('Known search engine bot')
        riskLevel = 'low'
      } else {
        confidence += 0.6
        reasons.push('Suspicious user-agent')
        riskLevel = 'high'
      }
    }

    // ヘッダー分析
    if (!analysis.headers.hasStandardHeaders) {
      confidence += 0.4
      reasons.push('Missing standard browser headers')
      riskLevel = Math.max(riskLevel, 'medium') as any
    }

    if (analysis.headers.suspiciousHeaders.length > 0) {
      confidence += 0.3 * analysis.headers.suspiciousHeaders.length
      reasons.push(`Suspicious headers: ${analysis.headers.suspiciousHeaders.join(', ')}`)
      riskLevel = Math.max(riskLevel, 'medium') as any
    }

    // タイミング分析
    if (analysis.timing.isRapidFire) {
      confidence += 0.5
      reasons.push('Rapid-fire requests detected')
      riskLevel = Math.max(riskLevel, 'high') as any
    }

    if (analysis.timing.isPerfectTiming) {
      confidence += 0.4
      reasons.push('Perfect timing pattern (non-human)')
      riskLevel = Math.max(riskLevel, 'medium') as any
    }

    // 行動分析
    if (analysis.behavior.sequentialRequests) {
      confidence += 0.3
      reasons.push('Sequential crawling pattern')
      riskLevel = Math.max(riskLevel, 'medium') as any
    }

    if (analysis.behavior.coversAllEndpoints) {
      confidence += 0.4
      reasons.push('Systematic endpoint enumeration')
      riskLevel = Math.max(riskLevel, 'high') as any
    }

    // 信頼度の正規化
    confidence = Math.min(confidence, 1.0)

    const isBot = confidence > 0.5
    const shouldBlock = confidence > 0.7 || riskLevel === 'critical'
    const shouldChallenge = confidence > 0.4 && confidence <= 0.7

    return {
      isBot,
      confidence,
      reasons,
      shouldBlock,
      shouldChallenge,
      riskLevel,
    }
  }

  /**
   * リクエスト分析
   */
  private async analyzeRequest(
    request: NextRequest, 
    clientId: string
  ): Promise<RequestAnalysis> {
    const userAgentAnalysis = this.analyzeUserAgent(request)
    const headerAnalysis = this.analyzeHeaders(request)
    const timingAnalysis = this.analyzeTimingPatterns(clientId)
    const behaviorAnalysis = this.analyzeBehaviorPatterns(clientId)

    // リクエスト履歴を更新
    this.updateRequestHistory(request, clientId)

    return {
      userAgent: userAgentAnalysis,
      headers: headerAnalysis,
      timing: timingAnalysis,
      behavior: behaviorAnalysis,
    }
  }

  /**
   * User-Agent 分析
   */
  private analyzeUserAgent(request: NextRequest): UserAgentAnalysis {
    const userAgent = request.headers.get('user-agent') || ''
    const lowerUA = userAgent.toLowerCase()

    // 既知のBotチェック
    const isGoodBot = this.knownBots.good.some(bot => lowerUA.includes(bot))
    const isSuspiciousBot = this.knownBots.suspicious.some(bot => lowerUA.includes(bot))
    const isMaliciousBot = this.knownBots.malicious.some(bot => lowerUA.includes(bot))

    const isKnownBot = isGoodBot || isSuspiciousBot || isMaliciousBot
    const isSuspicious = isSuspiciousBot || isMaliciousBot || 
                        this.isSuspiciousUserAgent(userAgent)

    // ブラウザ情報の解析
    const browserInfo = this.parseBrowserInfo(userAgent)

    let botType: UserAgentAnalysis['botType']
    if (isGoodBot) {
      if (lowerUA.includes('google') || lowerUA.includes('bing')) {
        botType = 'search-engine'
      } else if (lowerUA.includes('facebook') || lowerUA.includes('twitter')) {
        botType = 'social-media'
      } else {
        botType = 'monitoring'
      }
    } else if (isMaliciousBot) {
      botType = 'malicious'
    } else if (isSuspiciousBot) {
      botType = 'scraper'
    }

    return {
      isKnownBot,
      isSuspicious,
      browserInfo,
      botType,
    }
  }

  /**
   * 怪しいUser-Agent判定
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /^$/,                    // 空のUser-Agent
      /^Mozilla\/5\.0$/,       // 最低限のMozilla文字列のみ
      /python|curl|wget/i,     // プログラム的なツール
      /bot|crawl|spider/i,     // 明示的なBot
      /headless/i,             // ヘッドレスブラウザ
      /phantom|selenium/i,     // 自動化ツール
    ]

    return suspiciousPatterns.some(pattern => pattern.test(userAgent))
  }

  /**
   * ブラウザ情報解析
   */
  private parseBrowserInfo(userAgent: string): UserAgentAnalysis['browserInfo'] {
    try {
      // 簡単なブラウザ解析
      const chromeMatch = userAgent.match(/Chrome\/(\d+)/)
      const firefoxMatch = userAgent.match(/Firefox\/(\d+)/)
      const safariMatch = userAgent.match(/Safari\/(\d+)/)
      
      let name = 'unknown'
      let version = 'unknown'
      
      if (chromeMatch) {
        name = 'Chrome'
        version = chromeMatch[1]
      } else if (firefoxMatch) {
        name = 'Firefox'
        version = firefoxMatch[1]
      } else if (safariMatch) {
        name = 'Safari'
        version = safariMatch[1]
      }

      const osMatch = userAgent.match(/(Windows|Macintosh|Linux|Android|iPhone)/)
      const os = osMatch ? osMatch[1] : 'unknown'

      return { name, version, os }
    } catch {
      return null
    }
  }

  /**
   * ヘッダー分析
   */
  private analyzeHeaders(request: NextRequest): HeaderAnalysis {
    const headers = Object.fromEntries(request.headers.entries())
    
    // 標準的なブラウザヘッダー
    const standardHeaders = [
      'accept',
      'accept-language',
      'accept-encoding',
      'user-agent',
    ]
    
    const hasStandardHeaders = standardHeaders.every(header => 
      request.headers.has(header)
    )

    const hasJavaScript = request.headers.get('accept')?.includes('*/*') || false
    const acceptsHtml = request.headers.get('accept')?.includes('text/html') || false

    // 怪しいヘッダー
    const suspiciousHeaders: string[] = []
    const suspiciousHeaderPatterns = [
      'x-forwarded-proto',
      'x-real-ip',
      'x-forwarded-for',
      'x-requested-with'
    ]

    suspiciousHeaderPatterns.forEach(pattern => {
      if (request.headers.has(pattern)) {
        suspiciousHeaders.push(pattern)
      }
    })

    // 不足しているヘッダー
    const missingHeaders = standardHeaders.filter(header => 
      !request.headers.has(header)
    )

    return {
      hasStandardHeaders,
      hasJavaScript,
      acceptsHtml,
      suspiciousHeaders,
      missingHeaders,
    }
  }

  /**
   * タイミングパターン分析
   */
  private analyzeTimingPatterns(clientId: string): TimingAnalysis {
    const history = this.requestHistory.get(clientId) || []
    
    if (history.length < 2) {
      return {
        requestsPerSecond: 0,
        averageInterval: 0,
        isRapidFire: false,
        isPerfectTiming: false,
      }
    }

    const now = Date.now()
    const recentRequests = history.filter(req => now - req.timestamp < 60000) // 1分以内

    const requestsPerSecond = recentRequests.length / 60
    
    // 間隔計算
    const intervals = []
    for (let i = 1; i < recentRequests.length; i++) {
      intervals.push(recentRequests[i].timestamp - recentRequests[i-1].timestamp)
    }

    const averageInterval = intervals.length > 0 ? 
      intervals.reduce((a, b) => a + b, 0) / intervals.length : 0

    const isRapidFire = requestsPerSecond > 10 // 10req/sec以上

    // 完璧なタイミング（Bot的パターン）
    const isPerfectTiming = intervals.length > 3 && 
      intervals.every(interval => Math.abs(interval - averageInterval) < 100) // 100ms以下の誤差

    return {
      requestsPerSecond,
      averageInterval,
      isRapidFire,
      isPerfectTiming,
    }
  }

  /**
   * 行動パターン分析
   */
  private analyzeBehaviorPatterns(clientId: string): BehaviorAnalysis {
    const history = this.requestHistory.get(clientId) || []
    
    if (history.length === 0) {
      return {
        hasInteraction: false,
        sequentialRequests: false,
        coversAllEndpoints: false,
        ignoresRobotsTxt: false,
      }
    }

    // インタラクションチェック（JavaScript、CSS、画像リクエストなど）
    const hasInteraction = history.some(req => 
      req.path.includes('.js') || 
      req.path.includes('.css') || 
      req.path.includes('.png') || 
      req.path.includes('.jpg')
    )

    // 連続的なリクエストパターン
    const paths = history.map(req => req.path)
    const uniquePaths = new Set(paths)
    const sequentialRequests = uniquePaths.size > 5 && paths.length > uniquePaths.size * 2

    // 全エンドポイントカバレッジ
    const apiPaths = paths.filter(path => path.startsWith('/api/'))
    const coversAllEndpoints = apiPaths.length > 10

    // robots.txt 無視
    const ignoresRobotsTxt = !history.some(req => req.path === '/robots.txt')

    return {
      hasInteraction,
      sequentialRequests,
      coversAllEndpoints,
      ignoresRobotsTxt,
    }
  }

  /**
   * リクエスト履歴更新
   */
  private updateRequestHistory(request: NextRequest, clientId: string): void {
    const history = this.requestHistory.get(clientId) || []
    
    history.push({
      timestamp: Date.now(),
      path: request.nextUrl.pathname,
      userAgent: request.headers.get('user-agent') || '',
      headers: Object.fromEntries(request.headers.entries()),
    })

    // 履歴を最新100件に制限
    if (history.length > 100) {
      history.splice(0, history.length - 100)
    }

    this.requestHistory.set(clientId, history)

    // 古い履歴のクリーンアップ
    this.cleanupOldHistory()
  }

  /**
   * クライアントID取得
   */
  private getClientId(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0] || realIp || 'unknown'
    const userAgent = request.headers.get('user-agent') || ''
    
    // IP + User-Agent のハッシュをクライアントIDとして使用
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex')
  }

  /**
   * 古い履歴のクリーンアップ
   */
  private cleanupOldHistory(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    
    for (const [clientId, history] of this.requestHistory.entries()) {
      const recentHistory = history.filter(req => req.timestamp > oneHourAgo)
      
      if (recentHistory.length === 0) {
        this.requestHistory.delete(clientId)
      } else if (recentHistory.length !== history.length) {
        this.requestHistory.set(clientId, recentHistory)
      }
    }
  }
}

// グローバルBot検出エンジン
const botDetectionEngine = new BotDetectionEngine()

/**
 * Bot検出エクスポート関数
 */
export const detectBot = botDetectionEngine.detectBot.bind(botDetectionEngine)

/**
 * セキュリティヘッダーチェック
 */
export function checkSecurityHeaders(request: NextRequest): {
  hasRequiredHeaders: boolean
  missingHeaders: string[]
  suspiciousHeaders: string[]
} {
  const requiredHeaders = ['user-agent', 'accept']
  const missingHeaders = requiredHeaders.filter(header => !request.headers.has(header))
  
  const suspiciousHeaderNames = [
    'x-scanner',
    'x-exploit',
    'x-attack',
  ]
  
  const suspiciousHeaders = suspiciousHeaderNames.filter(header => 
    request.headers.has(header)
  )

  return {
    hasRequiredHeaders: missingHeaders.length === 0,
    missingHeaders,
    suspiciousHeaders,
  }
}

/**
 * ハニーポット実装
 */
export class Honeypot {
  private static trapPaths = [
    '/admin',
    '/wp-admin',
    '/phpmyadmin',
    '/.env',
    '/config.php',
    '/database.sql',
  ]

  static isTrapPath(path: string): boolean {
    return this.trapPaths.some(trapPath => path.startsWith(trapPath))
  }

  static recordTrapAccess(request: NextRequest): void {
    const logData = {
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || 
          request.headers.get('x-real-ip') || 
          'unknown',
      userAgent: request.headers.get('user-agent') || '',
      path: request.nextUrl.pathname,
      method: request.method,
    }

    console.warn('Honeypot trap triggered:', JSON.stringify(logData, null, 2))
    
    // セキュリティ監視システムに通知
    // await notifySecurityTeam('honeypot-triggered', logData)
  }
}

/**
 * CAPTCHAチャレンジ（基本実装）
 */
export class CaptchaChallenge {
  private static challenges: Map<string, {
    answer: string
    timestamp: number
    attempts: number
  }> = new Map()

  static generateChallenge(): {
    challengeId: string
    question: string
    answer: string
  } {
    const challengeId = crypto.randomBytes(16).toString('hex')
    const num1 = Math.floor(Math.random() * 10) + 1
    const num2 = Math.floor(Math.random() * 10) + 1
    const answer = (num1 + num2).toString()
    
    this.challenges.set(challengeId, {
      answer,
      timestamp: Date.now(),
      attempts: 0,
    })

    return {
      challengeId,
      question: `${num1} + ${num2} = ?`,
      answer,
    }
  }

  static validateChallenge(challengeId: string, userAnswer: string): boolean {
    const challenge = this.challenges.get(challengeId)
    
    if (!challenge) {
      return false
    }

    challenge.attempts++

    // 5分以内かつ3回以内の試行
    const isValid = Date.now() - challenge.timestamp < 5 * 60 * 1000 && 
                   challenge.attempts <= 3 &&
                   challenge.answer === userAnswer.trim()

    if (isValid || challenge.attempts >= 3) {
      this.challenges.delete(challengeId)
    }

    return isValid
  }
}