import { z } from 'zod';

// =============================================================================
// カタログクライアント - MCP サーバーカタログへのアクセスを提供
// Docker Hub MCP レジストリと GitHub MCP Registry を使用
// =============================================================================

/**
 * カタログエントリのスキーマ
 */
export const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().url(),
  homepage: z.string().url().optional(),
  documentation: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  downloadCount: z.number().optional(),
  rating: z.number().min(0).max(5).optional(),
  lastUpdated: z.string().datetime().optional(),
  capabilities: z.array(z.string()).default([]),
  requirements: z.object({
    memory: z.string().optional(),
    cpu: z.string().optional(),
    disk: z.string().optional(),
    network: z.boolean().default(false),
  }).optional(),
  // MCP固有のフィールドを追加
  installType: z.enum(['docker', 'npm', 'github', 'existing']),
  dockerImage: z.string().optional(),
  githubRepo: z.string().optional(),
  category: z.string().optional(),
  verified: z.boolean().default(false),
  icon: z.string().optional(),
  secrets: z.array(z.object({
    name: z.string(),
    env: z.string(),
    example: z.string().optional(),
  })).optional(),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

/**
 * カタログ検索結果のスキーマ
 */
export const CatalogSearchResultSchema = z.object({
  entries: z.array(CatalogEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  hasNext: z.boolean(),
});

export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;

/**
 * インストール進捗のスキーマ
 */
export const InstallationProgressSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  status: z.enum(['pending', 'downloading', 'installing', 'configuring', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  message: z.string(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  estimatedTimeRemaining: z.number().optional(),
});

export type InstallationProgress = z.infer<typeof InstallationProgressSchema>;

/**
 * カタログクライアントエラー
 */
export class CatalogClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CatalogClientError';
  }
}

/**
 * Docker Hub API レスポンススキーマ
 */
const DockerHubRepositorySchema = z.object({
  user: z.string(),
  name: z.string(),
  namespace: z.string(),
  repository_type: z.string(),
  status: z.number(),
  description: z.string().nullable(),
  is_private: z.boolean(),
  is_automated: z.boolean(),
  can_edit: z.boolean(),
  star_count: z.number(),
  pull_count: z.number(),
  last_updated: z.string(),
  is_migrated: z.boolean(),
  collaborator: z.boolean(),
  content_types: z.array(z.string()),
  categories: z.array(z.object({
    name: z.string(),
    label: z.string(),
  })).optional(),
});

type DockerHubRepository = z.infer<typeof DockerHubRepositorySchema>;

/**
 * GitHub API レスポンススキーマ
 */
const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  topics: z.array(z.string()).default([]),
  stargazers_count: z.number().default(0),
  updated_at: z.string(),
  language: z.string().nullable(),
  license: z.object({
    key: z.string(),
    name: z.string(),
  }).nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
});

type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

/**
 * MCP Server YAML 定義スキーマ
 */
const MCPServerYamlSchema = z.object({
  name: z.string(),
  image: z.string(),
  type: z.string(),
  meta: z.object({
    category: z.string(),
    tags: z.array(z.string()),
  }),
  about: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
  }),
  project: z.string(),
  branch: z.string().optional(),
  dockerfile: z.string().optional(),
  secrets: z.array(z.object({
    name: z.string(),
    env: z.string(),
    example: z.string().optional(),
  })).optional(),
});

type MCPServerYaml = z.infer<typeof MCPServerYamlSchema>;

/**
 * HTTP クライアント結果インターフェース
 */
interface HttpResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * カタログクライアント - Docker Hub と GitHub MCP Registry からのデータ統合
 */
export class CatalogClient {
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly githubApiUrl: string;
  private readonly dockerHubApiUrl: string;
  private readonly mcpRegistryRepo: string;

  // キャッシュ機能
  private static mcpRegistryCache: { 
    data: CatalogEntry[]; 
    timestamp: number; 
    ttl: number; 
  } | null = null;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

  constructor(options: {
    timeout?: number;
    maxRetries?: number;
    githubApiUrl?: string;
    dockerHubApiUrl?: string;
    mcpRegistryRepo?: string;
  } = {}) {
    this.timeout = options.timeout || 30000; // 30秒
    this.maxRetries = options.maxRetries || 3;
    this.githubApiUrl = options.githubApiUrl || 'https://api.github.com';
    this.dockerHubApiUrl = options.dockerHubApiUrl || 'https://hub.docker.com/v2';
    this.mcpRegistryRepo = options.mcpRegistryRepo || 'docker/mcp-registry';
  }

  /**
   * カタログからサーバーを検索
   */
  async searchServers(query: {
    search?: string;
    tags?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'name' | 'popularity' | 'updated' | 'rating';
    sortOrder?: 'asc' | 'desc';
  }): Promise<CatalogSearchResult> {
    try {
      // 両方のソースから並行してデータを取得（動的発見をデフォルトで使用）
      const [dockerHubEntries, mcpRegistryEntries] = await Promise.all([
        this.searchDockerHub(query.search || ''),
        this.getMCPRegistryServersDynamic()
      ]);

      // 結果をマージして重複を除去
      let allEntries = [...dockerHubEntries, ...mcpRegistryEntries];
      console.log(`[CATALOG_DEBUG] Before deduplication: ${allEntries.length} entries (Docker Hub: ${dockerHubEntries.length}, MCP Registry: ${mcpRegistryEntries.length})`);
      allEntries = this.deduplicateEntries(allEntries);
      console.log(`[CATALOG_DEBUG] After deduplication: ${allEntries.length} entries`);

      // フィルタリング
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        allEntries = allEntries.filter(entry =>
          entry.name.toLowerCase().includes(searchLower) ||
          entry.description.toLowerCase().includes(searchLower) ||
          entry.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      if (query.category) {
        allEntries = allEntries.filter(entry => entry.category === query.category);
      }

      if (query.tags && query.tags.length > 0) {
        allEntries = allEntries.filter(entry =>
          query.tags!.some(tag => entry.tags.includes(tag))
        );
      }

      // ソート
      const sortBy = query.sortBy || 'popularity';
      const sortOrder = query.sortOrder || 'desc';
      allEntries.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'updated':
            comparison = new Date(a.lastUpdated || 0).getTime() - new Date(b.lastUpdated || 0).getTime();
            break;
          case 'rating':
            comparison = (a.rating || 0) - (b.rating || 0);
            break;
          default: // popularity
            comparison = (a.downloadCount || 0) - (b.downloadCount || 0);
            break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // ページネーション
      const page = query.page || 1;
      const pageSize = Math.min(query.pageSize || 20, 100);
      const startIndex = (page - 1) * pageSize;
      console.log(`[CATALOG_DEBUG] Before pagination: ${allEntries.length} entries, page=${page}, pageSize=${pageSize}, startIndex=${startIndex}`);
      const paginatedEntries = allEntries.slice(startIndex, startIndex + pageSize);
      console.log(`[CATALOG_DEBUG] After pagination: ${paginatedEntries.length} entries`);

      const searchResult: CatalogSearchResult = {
        entries: paginatedEntries,
        total: allEntries.length,
        page,
        pageSize,
        hasNext: startIndex + pageSize < allEntries.length,
      };

      return CatalogSearchResultSchema.parse(searchResult);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }

      throw new CatalogClientError(
        `Catalog search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CATALOG_SEARCH_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * カタログエントリ一覧を取得（searchServersのエイリアス）
   */
  async listEntries(query: {
    page?: number;
    pageSize?: number;
    category?: string;
    search?: string;
    verified?: boolean;
    sortBy?: 'name' | 'verified' | 'updated' | 'popularity';
    sortOrder?: 'asc' | 'desc';
  }): Promise<CatalogSearchResult> {
    // searchServersと同じロジックを使用
    return this.searchServers({
      search: query.search,
      tags: query.category ? [query.category] : undefined,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy === 'verified' ? 'popularity' : query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  /**
   * カタログからサーバー詳細を取得
   */
  async getServerDetails(serverId: string): Promise<CatalogEntry> {
    try {
      // まず全カタログから一致するエントリを検索
      const searchResult = await this.searchServers({ search: serverId });
      
      // 完全一致またはIDが一致するエントリを探す
      let matchingEntry = searchResult.entries.find(entry => 
        entry.id === serverId || 
        entry.name === serverId ||
        entry.id.endsWith(serverId) ||
        entry.name.toLowerCase() === serverId.toLowerCase()
      );
      
      if (matchingEntry) {
        // より詳細な情報を取得するため、MCPレジストリまたはDocker Hubから追加情報を取得
        try {
          const additionalDetails = await this.getMCPServerDetails(serverId) || 
                                   await this.getDockerHubDetails(serverId);
          
          if (additionalDetails) {
            // 基本情報とマージ
            matchingEntry = {
              ...matchingEntry,
              ...additionalDetails,
              // 重要な情報は元のエントリを優先
              id: matchingEntry.id,
              downloadCount: matchingEntry.downloadCount,
              rating: matchingEntry.rating,
            };
          }
        } catch (detailError) {
          // 詳細取得に失敗しても基本情報は返す
          console.warn('Failed to get additional details:', detailError);
        }
        
        return CatalogEntrySchema.parse(matchingEntry);
      }

      // 直接的なマッチがない場合は、MCPレジストリから詳細を取得試行
      const mcpDetails = await this.getMCPServerDetails(serverId);
      if (mcpDetails) {
        return CatalogEntrySchema.parse(mcpDetails);
      }

      // Docker Hubから詳細を取得試行
      const dockerDetails = await this.getDockerHubDetails(serverId);
      if (dockerDetails) {
        return CatalogEntrySchema.parse(dockerDetails);
      }

      // 見つからない場合はエラー
      throw new CatalogClientError(
        `Server '${serverId}' not found in catalog`,
        'SERVER_NOT_FOUND',
        { serverId }
      );

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }

      throw new CatalogClientError(
        `Failed to get server details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVER_DETAILS_ERROR',
        { serverId, originalError: error }
      );
    }
  }

  /**
   * カタログからサーバーをインストール
   * Note: 実際のインストールは別のシステムが処理するため、インストールIDを生成して返す
   */
  async installServer(
    serverId: string,
    options: {
      name?: string;
      version?: string;
      config?: Record<string, any>;
      secrets?: Record<string, string>;
    } = {}
  ): Promise<string> {
    try {
      // サーバー詳細を取得してインストール可能性を確認
      await this.getServerDetails(serverId);

      // インストールIDを生成（実際のインストール処理は別システムで実行）
      const installationId = `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`[CATALOG] Installation request for ${serverId} with ID: ${installationId}`, {
        name: options.name,
        version: options.version,
        hasConfig: !!options.config,
        hasSecrets: !!options.secrets,
      });

      return installationId;

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }

      throw new CatalogClientError(
        `Server installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVER_INSTALL_ERROR',
        { serverId, options, originalError: error }
      );
    }
  }

  /**
   * インストール進捗を取得
   * Note: 実際の進捗管理は別システムで行うため、模擬的な進捗を返す
   */
  async getInstallationProgress(installationId: string): Promise<InstallationProgress> {
    try {
      // インストールIDの形式を確認
      if (!installationId.startsWith('install_')) {
        throw new CatalogClientError(
          `Installation '${installationId}' not found`,
          'INSTALLATION_NOT_FOUND',
          { installationId }
        );
      }

      // 模擬的な進捗データを生成
      const timestamp = installationId.split('_')[1];
      const startedAt = new Date(parseInt(timestamp)).toISOString();
      const elapsed = Date.now() - parseInt(timestamp);

      let status: 'pending' | 'downloading' | 'installing' | 'configuring' | 'completed' | 'failed';
      let progress: number;
      let message: string;

      if (elapsed < 5000) {
        status = 'downloading';
        progress = 25;
        message = 'Downloading server image...';
      } else if (elapsed < 15000) {
        status = 'installing';
        progress = 60;
        message = 'Installing dependencies...';
      } else if (elapsed < 20000) {
        status = 'configuring';
        progress = 90;
        message = 'Configuring server...';
      } else {
        status = 'completed';
        progress = 100;
        message = 'Installation completed successfully';
      }

      const progressData: InstallationProgress = {
        id: installationId,
        serverId: 'unknown',
        status,
        progress,
        message,
        startedAt,
        completedAt: status === 'completed' ? new Date().toISOString() : undefined,
        estimatedTimeRemaining: status === 'completed' ? 0 : Math.max(20000 - elapsed, 0),
      };

      return InstallationProgressSchema.parse(progressData);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }

      throw new CatalogClientError(
        `Failed to get installation progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INSTALL_PROGRESS_ERROR',
        { installationId, originalError: error }
      );
    }
  }

  /**
   * カタログのカテゴリ一覧を取得
   */
  async getCategories(): Promise<Array<{ id: string; name: string; count: number }>> {
    try {
      // Docker Hub と MCP Registry に基づいた実際のカテゴリ
      const categories = [
        { id: 'ai-ml', name: 'AI & Machine Learning', count: 0 },
        { id: 'database', name: 'Database', count: 0 },
        { id: 'devops', name: 'DevOps & CI/CD', count: 0 },
        { id: 'productivity', name: 'Productivity Tools', count: 0 },
        { id: 'integration', name: 'Integration & APIs', count: 0 },
        { id: 'monitoring', name: 'Monitoring & Logging', count: 0 },
        { id: 'security', name: 'Security & Authentication', count: 0 },
        { id: 'cloud', name: 'Cloud Services', count: 0 },
        { id: 'finance', name: 'Finance & Payment', count: 0 },
        { id: 'communication', name: 'Communication', count: 0 },
        { id: 'other', name: 'Other', count: 0 },
      ];

      // 実際のサーバー数を取得してカウントを更新
      try {
        const [dockerHubEntries, mcpRegistryEntries] = await Promise.all([
          this.searchDockerHub(''),
          this.getMCPRegistryServersDynamic()
        ]);

        const allEntries = this.deduplicateEntries([...dockerHubEntries, ...mcpRegistryEntries]);

        // カテゴリごとのカウント
        const categoryCounts: Record<string, number> = {};
        allEntries.forEach(entry => {
          const category = entry.category || 'other';
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });

        // カウントを更新
        categories.forEach(category => {
          category.count = categoryCounts[category.id] || 0;
        });
      } catch (error) {
        console.warn('Failed to get actual category counts:', error);
        // フォールバック値を使用
      }

      const CategoriesSchema = z.array(z.object({
        id: z.string(),
        name: z.string(),
        count: z.number(),
      }));

      return CategoriesSchema.parse(categories);

    } catch (error) {
      throw new CatalogClientError(
        `Failed to get categories: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CATEGORIES_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Docker Hub検索
   */
  private async searchDockerHub(query: string): Promise<CatalogEntry[]> {
    try {
      const allResults: DockerHubRepository[] = [];
      
      // 複数の検索戦略を使用してより包括的な結果を得る
      const searchStrategies = [
        // MCPオーガニゼーションの公式コンテナ
        'mcp/',
        // クエリベースの検索（ユーザー指定またはデフォルト）
        query ? query : 'mcp server',
        // AI・ツール関連の検索
        'ai-tools mcp',
        'model context protocol'
      ];

      const PAGE_SIZE = 50; // Docker Hub APIの最大サイズ
      const MAX_PAGES_PER_STRATEGY = 3; // 戦略ごとの最大ページ数

      for (const searchTerm of searchStrategies) {
        console.log(`Searching Docker Hub with term: "${searchTerm}"`);
        
        for (let page = 1; page <= MAX_PAGES_PER_STRATEGY; page++) {
          try {
            const result = await this.httpRequest<{
              count: number;
              results: DockerHubRepository[];
            }>(`${this.dockerHubApiUrl}/search/repositories/?q=${encodeURIComponent(searchTerm)}&page=${page}&page_size=${PAGE_SIZE}`);

            if (!result.success || !result.data) {
              if (page === 1) {
                console.warn(`Docker Hub search failed for "${searchTerm}":`, result.error);
              }
              break;
            }

            // 重複を避けるため、既存の結果と名前が重複しないもののみ追加
            const newRepos = result.data.results.filter(newRepo => 
              !allResults.some(existingRepo => existingRepo.name === newRepo.name)
            );
            
            allResults.push(...newRepos);
            console.log(`Docker Hub "${searchTerm}" page ${page}: ${newRepos.length} new repositories (total: ${allResults.length})`);

            // これ以上結果がない場合は終了
            if (result.data.results.length < PAGE_SIZE) {
              break;
            }

            // API制限を避けるため少し待機
            if (page < MAX_PAGES_PER_STRATEGY) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error) {
            console.warn(`Error searching Docker Hub for "${searchTerm}" page ${page}:`, error);
            break;
          }
        }

        // 戦略間の待機時間
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // MCP関連のリポジトリを優先してフィルタリング
      const mcpRelatedResults = allResults.filter(repo => {
        const nameWords = repo.name.toLowerCase();
        const descWords = (repo.description || '').toLowerCase();
        
        return nameWords.includes('mcp') || 
               nameWords.includes('model-context-protocol') ||
               nameWords.includes('server') ||
               descWords.includes('mcp') ||
               descWords.includes('model context protocol') ||
               descWords.includes('claude') ||
               repo.namespace === 'mcp'; // MCPオーガニゼーションのコンテナを含める
      });

      console.log(`Docker Hub search completed: ${mcpRelatedResults.length} MCP-related repositories found (from ${allResults.length} total)`);
      return mcpRelatedResults.map(repo => this.convertDockerHubToCatalogEntry(repo));
    } catch (error) {
      console.error('Failed to search Docker Hub:', error);
      return [];
    }
  }

  /**
   * GitHub MCP Registry取得 (レート制限回避版)
   */
  private async getMCPRegistryServers(): Promise<CatalogEntry[]> {
    try {
      console.log('[CATALOG_HTTP] Attempting MCP Registry servers using known server list...');

      // GitHub API の代わりに、既知のサーバーリストを使用してレート制限を回避
      const rawUrl = 'https://raw.githubusercontent.com/docker/mcp-registry/main';

      // Docker MCP Registry で利用可能なすべてのMCPサーバー（2024年調査に基づく）
      const knownServers = [
        // データベース・ストレージ
        'SQLite',
        'airtable-mcp-server',
        'postgres',
        'sqlite',
        'memory',
        'neo4j-memory',
        
        // AWS・クラウド関連
        'aks',
        'aws-cdk-mcp-server',
        'aws-core-mcp-server',
        'aws-kb-retrieval-server',
        'cloud-run-mcp',
        
        // 開発ツール・API
        'apify-mcp-server',
        'apify',
        'apollo-mcp-server',
        'docker',
        'git',
        'github',
        'gitlab',
        'kubectl-mcp-server',
        'maven-tools-mcp',
        'playwright-mcp-server',
        
        // AI・ML・検索
        'arxiv-mcp-server',
        'brave-search',
        'brave-search-python',
        'kgrag-mcp-server',
        'mcp-code-interpreter',
        'mcp-meta-analysis-r',
        'mcp-python-refactoring',
        'needle-mcp',
        
        // 生産性・コミュニケーション
        'linkedin-mcp-server',
        'mcp-discord',
        'notion',
        'obsidian',
        'linear',
        'slack',
        'todoist',
        'teamwork',
        
        // セキュリティ・監視
        'dynatrace-mcp-server',
        'firewalla-mcp-server',
        'hoverfly-mcp-server',
        'okta-mcp-fctr',
        'vuln-nist-mcp-server',
        'securenote-link-mcp-server',
        
        // ヘルスケア・業界特化
        'charmhealth-mcp-server',
        'hostinger-mcp-server',
        'keboola-mcp',
        
        // データ・分析
        'mcp-hackernews',
        'mcp-github-pr-issue-analyser',
        'kafka-schema-reg-mcp',
        'hummingbot-mcp',
        'wikipedia-mcp',
        
        // 統合・プロキシ
        'mcp-api-gateway',
        'pluggedin-mcp-proxy',
        'remote-mcp',
        'effect-mcp',
        
        // 特殊用途
        'unreal-engine-mcp-server',
        'opine-mcp-server',
        
        // ファイルシステム・その他
        'filesystem',
        'gdrive',
        'puppeteer',
        'time',
        'everart',
        
        // 従来サーバー（互換性維持）
        'anthropic-fetch',
        'anthropic-postgres'
      ];

      console.log(`Processing ${knownServers.length} known MCP servers...`);
      const allServers: CatalogEntry[] = [];

      // バッチ処理でサーバー情報を取得
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_BATCHES = 500;

      for (let i = 0; i < knownServers.length; i += BATCH_SIZE) {
        const batch = knownServers.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(knownServers.length / BATCH_SIZE)}`);

        const batchPromises = batch.map(async (serverName) => {
          try {
            const yamlUrl = `${rawUrl}/servers/${serverName}/server.yaml`;
            const result = await this.httpRequest<string>(yamlUrl, { expectJson: false });

            if (!result.success || !result.data) {
              console.warn(`Failed to load YAML for ${serverName}: ${result.error || 'No data'}`);
              return null;
            }

            return this.parseServerYaml(result.data, serverName);
          } catch (error) {
            console.error(`Error processing server ${serverName}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validServers = batchResults.filter(server => server !== null) as CatalogEntry[];
        allServers.push(...validServers);

        console.log(`Batch completed: ${validServers.length}/${batch.length} servers processed`);

        // 次のバッチまで遅延
        if (i + BATCH_SIZE < knownServers.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      console.log(`MCP Registry processing completed: ${allServers.length}/${knownServers.length} servers loaded`);
      return allServers;
    } catch (error) {
      console.error('Failed to get MCP registry servers:', error);
      return [];
    }
  }

  /**
   * GitHub APIを使用してMCP registryから動的にサーバーリストを取得
   * レート制限に注意して使用する（キャッシュ機能付き）
   */
  private async getMCPRegistryServersDynamic(): Promise<CatalogEntry[]> {
    try {
      // キャッシュチェック
      if (CatalogClient.mcpRegistryCache) {
        const now = Date.now();
        const cacheAge = now - CatalogClient.mcpRegistryCache.timestamp;
        if (cacheAge < CatalogClient.CACHE_TTL) {
          console.log(`[CATALOG_CACHE] Using cached MCP registry data (${Math.round(cacheAge / 1000)}s old)`);
          return CatalogClient.mcpRegistryCache.data;
        } else {
          console.log(`[CATALOG_CACHE] Cache expired (${Math.round(cacheAge / 1000)}s old), fetching fresh data`);
          CatalogClient.mcpRegistryCache = null;
        }
      }

      console.log('[CATALOG_HTTP] Attempting dynamic MCP Registry discovery...');

      // GitHub API経由でサーバーディレクトリ一覧を取得
      const result = await this.httpRequest<Array<{
        name: string;
        type: string;
      }>>(`${this.githubApiUrl}/repos/docker/mcp-registry/contents/servers`);

      if (!result.success || !result.data) {
        console.warn('Failed to fetch MCP registry directory listing:', result.error);
        // フォールバックとして既知のサーバーリストを使用
        return this.getMCPRegistryServers();
      }

      // ディレクトリのみをフィルタリング
      const serverDirectories = result.data
        .filter(item => item.type === 'dir')
        .map(item => item.name);

      console.log(`Found ${serverDirectories.length} server directories in MCP registry`);

      const allServers: CatalogEntry[] = [];
      const rawUrl = 'https://raw.githubusercontent.com/docker/mcp-registry/main';

      // バッチ処理でサーバー情報を取得
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_BATCHES = 1000; // GitHub APIのため長めの遅延

      for (let i = 0; i < serverDirectories.length; i += BATCH_SIZE) {
        const batch = serverDirectories.slice(i, i + BATCH_SIZE);
        console.log(`Processing dynamic batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(serverDirectories.length / BATCH_SIZE)}`);

        const batchPromises = batch.map(async (serverName) => {
          try {
            const yamlUrl = `${rawUrl}/servers/${serverName}/server.yaml`;
            const result = await this.httpRequest<string>(yamlUrl, { expectJson: false });

            if (!result.success || !result.data) {
              console.warn(`Failed to load YAML for ${serverName}: ${result.error || 'No data'}`);
              return null;
            }

            return this.parseServerYaml(result.data, serverName);
          } catch (error) {
            console.error(`Error processing server ${serverName}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validServers = batchResults.filter(server => server !== null) as CatalogEntry[];
        allServers.push(...validServers);

        console.log(`Dynamic batch completed: ${validServers.length}/${batch.length} servers processed`);

        // 次のバッチまで遅延（GitHub API制限対策）
        if (i + BATCH_SIZE < serverDirectories.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      console.log(`Dynamic MCP Registry processing completed: ${allServers.length}/${serverDirectories.length} servers loaded`);
      
      // キャッシュに保存
      CatalogClient.mcpRegistryCache = {
        data: allServers,
        timestamp: Date.now(),
        ttl: CatalogClient.CACHE_TTL
      };
      console.log(`[CATALOG_CACHE] Cached ${allServers.length} MCP registry entries for ${CatalogClient.CACHE_TTL / 1000}s`);
      
      return allServers;
    } catch (error) {
      console.error('Failed to get MCP registry servers dynamically:', error);
      
      // エラー時は古いキャッシュがあれば使用
      if (CatalogClient.mcpRegistryCache) {
        console.log(`[CATALOG_CACHE] Using stale cache due to error (${Math.round((Date.now() - CatalogClient.mcpRegistryCache.timestamp) / 1000)}s old)`);
        return CatalogClient.mcpRegistryCache.data;
      }
      
      // キャッシュもない場合は既知のサーバーリストにフォールバック
      console.log('Falling back to known server list...');
      return this.getMCPRegistryServers();
    }
  }

  /**
   * カタログ更新機能 - 動的および静的検索を組み合わせて最新のカタログを取得
   */
  async refreshCatalog(options: {
    useDynamicDiscovery?: boolean;
    forceUpdate?: boolean;
  } = {}): Promise<{
    totalEntries: number;
    dockerHubEntries: number;
    mcpRegistryEntries: number;
    updateTime: string;
  }> {
    try {
      console.log('[CATALOG_REFRESH] Starting catalog refresh...');
      
      const startTime = Date.now();
      const { useDynamicDiscovery = true, forceUpdate = false } = options;

      // 並行して両方のソースからデータを取得
      const [dockerHubEntries, mcpRegistryEntries] = await Promise.all([
        this.searchDockerHub(''), // 空文字で全体検索
        useDynamicDiscovery ? this.getMCPRegistryServersDynamic() : this.getMCPRegistryServers()
      ]);

      // 重複を除去
      const allEntries = this.deduplicateEntries([...dockerHubEntries, ...mcpRegistryEntries]);
      
      const updateStats = {
        totalEntries: allEntries.length,
        dockerHubEntries: dockerHubEntries.length,
        mcpRegistryEntries: mcpRegistryEntries.length,
        updateTime: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };

      console.log('[CATALOG_REFRESH] Catalog refresh completed:', updateStats);
      return updateStats;
    } catch (error) {
      console.error('[CATALOG_REFRESH] Failed to refresh catalog:', error);
      throw new CatalogClientError(
        `Catalog refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CATALOG_REFRESH_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * MCP Server詳細取得
   */
  private async getMCPServerDetails(serverId: string): Promise<CatalogEntry | null> {
    try {
      const yamlResult = await this.httpRequest<{ content: string }>(`${this.githubApiUrl}/repos/${this.mcpRegistryRepo}/contents/servers/${serverId}/server.yaml`);

      if (!yamlResult.success || !yamlResult.data) {
        return null;
      }

      const yamlContent = Buffer.from(yamlResult.data.content, 'base64').toString('utf-8');
      return this.parseServerYaml(yamlContent, serverId);
    } catch (error) {
      console.error('Failed to get MCP server details:', error);
      return null;
    }
  }

  /**
   * Docker Hub詳細取得
   */
  private async getDockerHubDetails(repoName: string): Promise<CatalogEntry | null> {
    try {
      const result = await this.httpRequest<DockerHubRepository>(`${this.dockerHubApiUrl}/repositories/${repoName}/`);

      if (!result.success || !result.data) {
        return null;
      }

      return this.convertDockerHubToCatalogEntry(result.data);
    } catch (error) {
      console.error('Failed to get Docker Hub details:', error);
      return null;
    }
  }

  /**
   * 重複除去
   */
  private deduplicateEntries(entries: CatalogEntry[]): CatalogEntry[] {
    const seen = new Set<string>();
    return entries.filter(entry => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * YAML解析（簡易版）
   */
  private parseServerYaml(yamlContent: string, dirName: string): CatalogEntry | null {
    try {
      // 簡易YAMLパーサー（実際のプロジェクトではyamlライブラリを使用推奨）
      const lines = yamlContent.split('\n');
      const server: Partial<MCPServerYaml> = {
        meta: { category: '', tags: [] },
        about: { title: '', description: '' }
      };

      let currentSection = '';
      let inSecretsSection = false;
      const secrets: Array<{ name: string; env: string; example?: string }> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // セクション判定
        if (trimmed.endsWith(':') && !trimmed.includes(' ')) {
          currentSection = trimmed.slice(0, -1);
          inSecretsSection = currentSection === 'secrets';
          continue;
        }

        if (inSecretsSection) {
          // secrets セクションの処理
          if (trimmed.startsWith('- name:')) {
            const name = trimmed.replace('- name:', '').trim().replace(/^["']|["']$/g, '');
            secrets.push({ name, env: '' });
          } else if (trimmed.startsWith('env:') && secrets.length > 0) {
            const env = trimmed.replace('env:', '').trim().replace(/^["']|["']$/g, '');
            secrets[secrets.length - 1].env = env;
          } else if (trimmed.startsWith('example:') && secrets.length > 0) {
            const example = trimmed.replace('example:', '').trim().replace(/^["']|["']$/g, '');
            secrets[secrets.length - 1].example = example;
          }
          continue;
        }

        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');

        if (currentSection === 'meta') {
          if (key.trim() === 'category') server.meta!.category = value;
          if (key.trim() === 'tags' && value.startsWith('[')) {
            server.meta!.tags = value.slice(1, -1).split(',').map(t => t.trim().replace(/["']/g, ''));
          }
        } else if (currentSection === 'about') {
          if (key.trim() === 'title') server.about!.title = value;
          if (key.trim() === 'description') server.about!.description = value;
          if (key.trim() === 'icon') server.about!.icon = value;
        } else {
          if (key.trim() === 'name') server.name = value;
          if (key.trim() === 'image') server.image = value;
          if (key.trim() === 'project') server.project = value;
        }
      }

      if (secrets.length > 0) {
        server.secrets = secrets;
      }

      return this.convertMCPServerToCatalogEntry(server as MCPServerYaml, dirName);
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      return null;
    }
  }

  /**
   * HTTPリクエストを実行
   */
  private async httpRequest<T = any>(
    url: string,
    options: { expectJson?: boolean } = { expectJson: true }
  ): Promise<HttpResult<T>> {
    try {
      console.log(`[CATALOG_HTTP] Requesting: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const headers: Record<string, string> = {
        'User-Agent': 'Docker-MCP-Web-Manager/2.0.0',
      };

      if (options.expectJson !== false) {
        headers['Accept'] = 'application/json';
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
        };
      }

      const data: T = options.expectJson === false
        ? (await response.text() as unknown as T)
        : await response.json();

      return {
        success: true,
        data,
        status: response.status,
      };

    } catch (error) {
      console.error(`[CATALOG_HTTP] Request failed:`, error);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Docker Hub -> CatalogEntry変換
   */
  private convertDockerHubToCatalogEntry(repo: DockerHubRepository): CatalogEntry {
    return {
      id: `${repo.namespace}/${repo.name}`,
      name: repo.name,
      description: repo.description || 'No description available',
      version: 'latest',
      author: repo.namespace,
      tags: repo.categories?.map(cat => cat.name) || [],
      imageUrl: `https://hub.docker.com/r/${repo.namespace}/${repo.name}/logo`,
      homepage: `https://hub.docker.com/r/${repo.namespace}/${repo.name}`,
      repository: `https://hub.docker.com/r/${repo.namespace}/${repo.name}`,
      downloadCount: repo.pull_count || 0,
      rating: Math.min(5, Math.max(0, (repo.star_count / 10) * 5)),
      lastUpdated: repo.last_updated,
      capabilities: this.extractCapabilitiesFromTags(repo.categories?.map(cat => cat.name) || []),
      requirements: {
        memory: '256MB',
        cpu: '0.1',
        disk: '100MB',
        network: true,
      },
      installType: 'docker',
      dockerImage: `${repo.namespace}/${repo.name}`,
      category: this.inferCategory(repo.categories?.map(cat => cat.name) || [], repo.description || ''),
      verified: repo.repository_type === 'image',
      icon: `https://hub.docker.com/v2/repositories/${repo.namespace}/${repo.name}/logo/`
    };
  }

  /**
   * MCP Server -> CatalogEntry変換
   */
  private convertMCPServerToCatalogEntry(server: MCPServerYaml, dirName: string): CatalogEntry {
    return {
      id: dirName,
      name: server.about?.title || server.name || dirName,
      description: server.about?.description || 'No description available',
      version: 'latest',
      author: 'Docker MCP Registry',
      tags: server.meta?.tags || [],
      imageUrl: server.about?.icon || 'https://github.com/docker.png',
      homepage: server.project,
      repository: server.project,
      downloadCount: 0,
      rating: 5,
      lastUpdated: new Date().toISOString(),
      capabilities: this.extractCapabilitiesFromTags(server.meta?.tags || []),
      requirements: {
        memory: '256MB',
        cpu: '0.1',
        disk: '100MB',
        network: true,
      },
      installType: 'docker',
      dockerImage: server.image,
      githubRepo: server.project?.replace('https://github.com/', ''),
      category: server.meta?.category || 'other',
      verified: true,
      icon: server.about?.icon,
      secrets: server.secrets
    };
  }

  /**
   * カテゴリ推論
   */
  private inferCategory(tags: string[], description: string): string {
    const text = `${tags.join(' ')} ${description}`.toLowerCase();

    if (text.includes('ai') || text.includes('ml') || text.includes('llm') || text.includes('openai')) return 'ai-ml';
    if (text.includes('database') || text.includes('db') || text.includes('sql') || text.includes('postgres') || text.includes('mysql')) return 'database';
    if (text.includes('devops') || text.includes('ci') || text.includes('cd') || text.includes('github') || text.includes('gitlab')) return 'devops';
    if (text.includes('monitor') || text.includes('log') || text.includes('metric') || text.includes('observability')) return 'monitoring';
    if (text.includes('security') || text.includes('auth') || text.includes('vault')) return 'security';
    if (text.includes('productivity') || text.includes('todo') || text.includes('task') || text.includes('notion') || text.includes('linear')) return 'productivity';
    if (text.includes('cloud') || text.includes('aws') || text.includes('azure') || text.includes('gcp')) return 'cloud';
    if (text.includes('finance') || text.includes('payment') || text.includes('billing')) return 'finance';
    if (text.includes('communication') || text.includes('slack') || text.includes('discord') || text.includes('email')) return 'communication';

    return 'other';
  }

  /**
   * タグから機能を抽出
   */
  private extractCapabilitiesFromTags(tags: string[]): string[] {
    const capabilityMap: Record<string, string> = {
      'web': 'Web API',
      'api': 'REST API',
      'database': 'Database Access',
      'file': 'File Operations',
      'docker': 'Container Management',
      'git': 'Git Operations',
      'ai': 'AI/ML',
      'nlp': 'Natural Language Processing',
      'data': 'Data Processing',
      'monitoring': 'System Monitoring',
      'cloud': 'Cloud Services',
      'github': 'GitHub Integration',
      'aws': 'AWS Services',
      'azure': 'Azure Services',
      'gcp': 'Google Cloud Services',
    };

    return tags
      .map(tag => capabilityMap[tag.toLowerCase()])
      .filter(Boolean);
  }

}