import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { getModel, trimPrompt } from './ai/providers';
import { conferenceSystemPrompt } from './prompt';
import { Conference, ConferenceSchema } from './types/conference';

function log(...args: any[]) {
  console.log('[Conference Search]', ...args);
}

// 並列処理の制限数
const ConcurrencyLimit = Number(process.env.FIRECRAWL_CONCURRENCY) || 2;

// Firecrawlクライアント初期化
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

/**
 * 学会検索用のSERPクエリを生成
 *
 * @param numQueries - 生成するクエリ数（デフォルト: 5）
 * @returns 検索クエリと研究目標の配列
 */
async function generateConferenceSerpQueries({
  numQueries = 5,
}: {
  numQueries?: number;
}): Promise<Array<{ query: string; researchGoal: string }>> {
  const res = await generateObject({
    model: getModel(),
    system: conferenceSystemPrompt(),
    prompt: `日本国内の学会・カンファレンス情報を検索するための検索クエリを${numQueries}個生成してください。

【要件】
- 各クエリは異なる検索戦略を使用すること
- 公式サイトが検索結果に表示されやすいクエリにすること
- 2025年以降に開催されるイベントを優先すること

【検索クエリの例】
- "学会 カンファレンス 2025 締切 日本"
- "Call for Papers 日本 2025"
- "研究発表 募集 学会 2026"
- "国際会議 日本開催 応募"`,
    schema: z.object({
      queries: z
        .array(
          z.object({
            query: z.string().describe('検索クエリ文字列'),
            researchGoal: z
              .string()
              .describe('このクエリで見つけたい学会の特徴'),
          }),
        )
        .max(numQueries)
        .describe(`検索クエリのリスト（最大${numQueries}件）`),
    }),
  });

  log(`生成されたクエリ:`, res.object.queries);
  return res.object.queries;
}

/**
 * 検索結果から学会情報を構造化データとして抽出
 *
 * @param query - 検索クエリ
 * @param result - Firecrawlの検索結果
 * @param maxConferences - 抽出する最大件数（デフォルト: 5）
 * @returns Conference[] - 抽出された学会情報
 */
async function processConferenceResult({
  query,
  result,
  maxConferences = 5,
}: {
  query: string;
  result: SearchResponse;
  maxConferences?: number;
}): Promise<Conference[]> {
  // Markdown コンテンツを抽出
  const contents = compact(result.data.map(item => item.markdown)).map(
    content => trimPrompt(content, 25_000),
  );

  if (contents.length === 0) {
    log(`コンテンツが見つかりませんでした (${query})`);
    return [];
  }

  log(`処理中: ${query} (${contents.length}件のコンテンツ)`);

  // LLMで構造化データを抽出
  const res = await generateObject({
    model: getModel(),
    abortSignal: AbortSignal.timeout(60_000),
    system: conferenceSystemPrompt(),
    prompt: trimPrompt(
      `以下の検索結果から、日本国内の学会・カンファレンス情報を抽出してください。

【検索クエリ】
${query}

【検索結果のコンテンツ】
${contents.map((content, i) => `<content index="${i}">\n${content}\n</content>`).join('\n')}

【抽出要件】
1. 公式サイトのコンテンツのみから情報を抽出する
2. 各学会・カンファレンスごとに1つのConferenceオブジェクトを生成
3. 最大${maxConferences}件まで抽出（見つからない場合は少なくてもOK）
4. 過去のイベントは除外（開催日が現在時刻より未来のもののみ）
5. 情報が不足している項目は空文字を使用

重要: 複数の学会が見つかった場合は配列で返してください。`,
    ),
    schema: z.object({
      conferences: z
        .array(ConferenceSchema)
        .max(maxConferences)
        .describe('抽出された学会・カンファレンス情報'),
    }),
  });

  log(`抽出された学会数: ${res.object.conferences.length}`);

  // date フィールドを現在時刻で上書き
  const now = new Date().toISOString();
  const conferencesWithDate = res.object.conferences.map(conf => ({
    ...conf,
    date: now,
  }));

  return conferencesWithDate;
}

/**
 * 重複する学会情報を除去
 * link（URL）が同じものを1つにまとめる
 *
 * @param conferences - 学会情報の配列
 * @returns 重複を除去した配列
 */
function deduplicateConferences(conferences: Conference[]): Conference[] {
  const seen = new Map<string, Conference>();

  for (const conf of conferences) {
    if (!seen.has(conf.link)) {
      seen.set(conf.link, conf);
    }
  }

  return Array.from(seen.values());
}

/**
 * 日本国内の学会・カンファレンス情報を検索する
 *
 * @param options.minResults - 最低限取得する件数（デフォルト: 10）
 * @param options.maxQueries - 生成する検索クエリの最大数（デフォルト: 5）
 * @returns Conference[] - 学会・カンファレンス情報の配列
 */
export async function searchConferences(options?: {
  minResults?: number;
  maxQueries?: number;
}): Promise<Conference[]> {
  const { minResults = 10, maxQueries = 5 } = options ?? {};

  log('学会・カンファレンス検索を開始します...');

  // 1. 検索クエリを生成
  const serpQueries = await generateConferenceSerpQueries({
    numQueries: maxQueries,
  });

  log(`生成された検索クエリ数: ${serpQueries.length}`);

  // 2. 並列で検索を実行
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          // Firecrawlで検索
          const searchResult = await firecrawl.search(serpQuery.query, {
            timeout: 30000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // 検索結果から学会情報を抽出
          const conferences = await processConferenceResult({
            query: serpQuery.query,
            result: searchResult,
            maxConferences: 5,
          });

          return conferences;
        } catch (error: any) {
          // エラーログ出力
          if (error.message?.includes('Timeout')) {
            log(`タイムアウトエラー (${serpQuery.query}):`, error.message);
          } else if (error.message?.includes('rate limit')) {
            log(`レート制限エラー (${serpQuery.query}):`, error.message);
          } else {
            log(`予期しないエラー (${serpQuery.query}):`, error);
          }

          // 空配列を返してスキップ
          return [];
        }
      }),
    ),
  );

  // 3. 結果を集約（重複を除去）
  const flatResults = results.flat();
  const uniqueConferences = deduplicateConferences(flatResults);

  log(`合計 ${uniqueConferences.length} 件の学会・カンファレンスを発見`);

  // 4. 締切日でソート（締切が近い順）
  const sorted = uniqueConferences.sort((a, b) => {
    // 日付が空文字の場合は後ろに
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;

    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return sorted;
}
