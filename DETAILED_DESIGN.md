# 詳細設計書 - 学会・カンファレンス検索API

## 1. データ型定義

### 1.1 Conference型（TypeScript Interface）

```typescript
// src/types/conference.ts (新規作成)

export interface Conference {
  link: string;                    // 学会公式サイトURL
  name: string;                    // 学会・カンファレンス名
  type: string;                    // イベントタイプ
  scope: string;                   // 参加対象者の範囲
  deadline: string;                // 応募締切日 (ISO 8601: YYYY-MM-DD)
  term: string;                    // 開催期間（人間が読みやすい形式）
  conference_start_date: string;   // 開催開始日 (ISO 8601: YYYY-MM-DD)
  conference_end_date: string;     // 開催終了日 (ISO 8601: YYYY-MM-DD)
  icon: string;                    // アイコン画像URL（空文字の場合あり）
  conference_organizer: string;    // 主催者名
  institution: string;             // 主催機関
  text: string;                    // 学会の概要・説明文
  date: string;                    // データ取得日時 (ISO 8601: YYYY-MM-DDTHH:mm:ss+09:00)
  read_status: "";                 // 固定値: 空文字
  labels: [];                      // 固定値: 空配列
  tags: [];                        // 固定値: 空配列
}
```

### 1.2 Zodスキーマ定義

```typescript
// src/types/conference.ts

import { z } from 'zod';

export const ConferenceSchema = z.object({
  link: z.string().url().describe('学会公式サイトのURL'),
  name: z.string().min(1).describe('学会・カンファレンス名'),
  type: z.string().describe('イベントタイプ（例: 国際会議, 国内学会, ワークショップ）'),
  scope: z.string().describe('参加対象者の範囲（例: 誰でもOK, 大学院生のみ）'),
  deadline: z.string().describe('応募締切日 (ISO 8601形式: YYYY-MM-DD)'),
  term: z.string().describe('開催期間の人間が読みやすい表現（例: 3日間）'),
  conference_start_date: z.string().describe('開催開始日 (ISO 8601形式: YYYY-MM-DD)'),
  conference_end_date: z.string().describe('開催終了日 (ISO 8601形式: YYYY-MM-DD)'),
  icon: z.string().describe('アイコン画像のURL（存在しない場合は空文字）'),
  conference_organizer: z.string().describe('主催者名'),
  institution: z.string().describe('主催機関'),
  text: z.string().describe('学会の概要・説明文'),
  date: z.string().datetime().describe('データ取得日時 (ISO 8601形式)'),
  read_status: z.literal("").describe('読了ステータス（固定値: 空文字）'),
  labels: z.array(z.never()).describe('ラベル（固定値: 空配列）'),
  tags: z.array(z.never()).describe('タグ（固定値: 空配列）'),
});

export const ConferencesResponseSchema = z.object({
  conferences: z.array(ConferenceSchema).describe('学会・カンファレンス情報の配列'),
});

export type Conference = z.infer<typeof ConferenceSchema>;
export type ConferencesResponse = z.infer<typeof ConferencesResponseSchema>;
```

## 2. プロンプト設計

### 2.1 システムプロンプト（学会検索用）

```typescript
// src/prompt.ts に追加

export const conferenceSystemPrompt = () => {
  const now = new Date().toISOString();
  return `あなたは日本国内の学会・カンファレンス情報を専門に検索・抽出するアシスタントです。
現在時刻: ${now}

以下の指示に厳密に従ってください：

【検索対象】
- 日本国内で開催される学会・カンファレンス情報のみ
- 公式サイトからの情報のみを使用（WikiCFP、connpassなどのアグリゲーションサイトは除外）

【抽出する情報】
以下のフィールドを必ず抽出してください：
1. link: 学会公式サイトのURL
2. name: 学会・カンファレンスの正式名称
3. type: イベントタイプ（国際会議/国内学会/ワークショップ/講演会/シンポジウム など）
4. scope: 参加対象者（誰でもOK/学部3年以上/大学院生のみ/会員限定 など）
5. deadline: 応募・申込締切日（YYYY-MM-DD形式）
6. term: 開催期間の説明（例: "3日間", "2025年3月10日〜12日"）
7. conference_start_date: 開催開始日（YYYY-MM-DD形式）
8. conference_end_date: 開催終了日（YYYY-MM-DD形式）
9. icon: アイコン画像のURL（見つからない場合は空文字）
10. conference_organizer: 主催者名
11. institution: 主催機関
12. text: 学会の基本概要（200文字程度）
13. date: データ取得日時（現在時刻をISO 8601形式で）

【データ形式の注意】
- 日付は必ずISO 8601形式（YYYY-MM-DD）で返す
- 和暦（令和7年など）が含まれる場合は西暦に変換する
- 情報が不足している場合は空文字（""）を使用
- read_status は常に ""
- labels と tags は常に []

【品質基準】
- 公式サイト以外の情報は使用しない
- 曖昧な情報は含めない
- 過去のイベント情報は除外する（現在時刻より未来のイベントのみ）`;
};
```

### 2.2 検索クエリ生成プロンプト

```typescript
// generateConferenceSerpQueries 関数内で使用

const queryGenerationPrompt = `日本国内の学会・カンファレンス情報を検索するための検索クエリを${numQueries}個生成してください。

【要件】
- 各クエリは異なる検索戦略を使用すること
- 公式サイトが検索結果に表示されやすいクエリにすること
- 2025年以降に開催されるイベントを優先すること

【検索クエリの例】
- "学会 カンファレンス 2025 締切 日本"
- "Call for Papers 日本 2025"
- "研究発表 募集 学会 2026"
- "国際会議 日本開催 応募"

各クエリについて、以下を含めてください：
1. query: 実際の検索クエリ文字列
2. researchGoal: このクエリで見つけたい学会の特徴（例: "締切が近い学会", "国際会議", "特定分野の学会"）`;
```

### 2.3 学会情報抽出プロンプト

```typescript
// processConferenceResult 関数内で使用

const extractionPrompt = `以下の検索結果から、日本国内の学会・カンファレンス情報を抽出してください。

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

【日付の正規化】
- "令和7年3月10日" → "2025-03-10"
- "2025/3/10" → "2025-03-10"
- "3月10日-12日" → start: "2025-03-10", end: "2025-03-12"

重要: 複数の学会が見つかった場合は配列で返してください。`;
```

## 3. 関数設計

### 3.1 searchConferences（メイン関数）

**ファイル**: `src/conference-research.ts`（新規作成）

```typescript
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
  const allConferences: Conference[] = [];

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
          log(`検索エラー (${serpQuery.query}):`, error.message);
          return [];
        }
      })
    )
  );

  // 3. 結果を集約（重複を除去）
  const flatResults = results.flat();
  const uniqueConferences = deduplicateConferences(flatResults);

  log(`合計 ${uniqueConferences.length} 件の学会・カンファレンスを発見`);

  // 4. 開催日でソート（締切が近い順）
  const sorted = uniqueConferences.sort((a, b) => {
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return sorted;
}
```

### 3.2 generateConferenceSerpQueries（検索クエリ生成）

```typescript
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
```

### 3.3 processConferenceResult（学会情報抽出）

```typescript
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
  const contents = compact(result.data.map(item => item.markdown)).map(content =>
    trimPrompt(content, 25_000),
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
```

### 3.4 deduplicateConferences（重複除去）

```typescript
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
```

## 4. APIエンドポイント実装

### 4.1 GET /conferences

**ファイル**: `src/api.ts`（既存ファイルに追加）

```typescript
import { searchConferences } from './conference-research';

// 既存のエンドポイントの後に追加

/**
 * 学会・カンファレンス検索エンドポイント
 * GET /conferences
 */
app.get('/conferences', async (req: Request, res: Response) => {
  try {
    log('\n学会・カンファレンス検索を開始...\n');

    // 将来的にクエリパラメータをサポート
    // const { field, deadline_from, deadline_to, limit } = req.query;

    // 学会検索を実行（最低10件）
    const conferences = await searchConferences({
      minResults: 10,
      maxQueries: 5,
    });

    // レスポンスを返却
    return res.status(200).json({
      conferences,
      count: conferences.length,
    });

  } catch (error: unknown) {
    console.error('学会検索APIでエラーが発生:', error);

    return res.status(500).json({
      error: 'エラーが発生しました',
    });
  }
});
```

## 5. ファイル構成

### 5.1 新規作成ファイル

```
src/
├── types/
│   └── conference.ts          # Conference型、Zodスキーマ定義
├── conference-research.ts     # 学会検索のメインロジック
└── (既存ファイルは変更)
```

### 5.2 変更ファイル

```
src/
├── api.ts                     # GET /conferences エンドポイント追加
├── prompt.ts                  # conferenceSystemPrompt() 追加
└── (deep-research.ts は変更なし、既存機能を維持)
```

## 6. エラーハンドリ���グ

### 6.1 エラーの種類と対応

| エラー種類 | HTTPステータス | レスポンス | 対応 |
|----------|--------------|-----------|-----|
| Firecrawl APIタイムアウト | 500 | `{"error": "エラーが発生しました"}` | ログ出力、空配列を返してスキップ |
| Firecrawl APIレート制限 | 500 | `{"error": "エラーが発生しました"}` | ログ出力、リトライなし |
| LLM生成エラー | 500 | `{"error": "エラーが発生しました"}` | ログ出力、該当クエリをスキップ |
| 検索結果0件 | 200 | `{"conferences": [], "count": 0}` | 正常終了 |
| 予期しないエラー | 500 | `{"error": "エラーが発生しました"}` | スタックトレースをログ出力 |

### 6.2 エラーハンドリングコード例

```typescript
try {
  const searchResult = await firecrawl.search(serpQuery.query, {
    timeout: 30000,
    limit: 5,
    scrapeOptions: { formats: ['markdown'] },
  });

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
```

## 7. ロギング仕様

### 7.1 ログレベル

```typescript
function log(...args: any[]) {
  console.log('[Conference Search]', ...args);
}
```

### 7.2 主要なログポイント

1. 検索開始
2. 生成されたクエリ数
3. 各クエリの検索結果（コンテンツ数）
4. 抽出された学会数
5. 合計件数
6. エラー発生時の詳細

### 7.3 ログ出力例

```
[Conference Search] 学会・カンファレンス検索を開始します...
[Conference Search] 生成されたクエリ: [
  { query: '学会 カンファレンス 2025 締切 日本', researchGoal: '締切が近い学会' },
  ...
]
[Conference Search] 処理中: 学会 カンファレンス 2025 締切 日本 (5件のコンテンツ)
[Conference Search] 抽出された学会数: 3
[Conference Search] 合計 12 件の学会・カンファレンスを発見
```

## 8. パフォーマンス最適化

### 8.1 並列処理

- **p-limit**で並列度を制御
- デフォルト: `FIRECRAWL_CONCURRENCY`環境変数（2）
- 推奨: 有料版Firecrawlの場合は3-5

### 8.2 タイムアウト設定

```typescript
// Firecrawl検索タイムアウト
timeout: 30000  // 30秒

// LLM生成タイムアウト
abortSignal: AbortSignal.timeout(60_000)  // 60秒
```

### 8.3 コンテンツサイズ制限

```typescript
// 各コンテンツを25,000トークンに制限
trimPrompt(content, 25_000)
```

## 9. テストケース（将来実装）

### 9.1 単体テスト

```typescript
describe('deduplicateConferences', () => {
  it('同じlinkを持つ学会を1つにまとめる', () => {
    const conferences = [
      { link: 'https://example.com', name: '学会A', ... },
      { link: 'https://example.com', name: '学会A（重複）', ... },
      { link: 'https://example2.com', name: '学会B', ... },
    ];

    const result = deduplicateConferences(conferences);
    expect(result).toHaveLength(2);
  });
});
```

### 9.2 統合テスト

```typescript
describe('GET /conferences', () => {
  it('学会情報を10件以上返す', async () => {
    const response = await request(app).get('/conferences');

    expect(response.status).toBe(200);
    expect(response.body.conferences).toBeDefined();
    expect(response.body.count).toBeGreaterThanOrEqual(0);
  });

  it('エラー時に500を返す', async () => {
    // Firecrawl APIをモック（エラーを返す）
    jest.spyOn(firecrawl, 'search').mockRejectedValue(new Error('API Error'));

    const response = await request(app).get('/conferences');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('エラーが発生しました');
  });
});
```

## 10. 実装順序

### フェーズ1: 基本実装
1. `src/types/conference.ts` を作成（型定義、Zodスキーマ）
2. `src/prompt.ts` に `conferenceSystemPrompt()` を追加
3. `src/conference-research.ts` を作成
   - `generateConferenceSerpQueries()`
   - `processConferenceResult()`
   - `deduplicateConferences()`
   - `searchConferences()`
4. `src/api.ts` に `GET /conferences` エンドポイントを追加

### フェーズ2: テスト・調整
5. ローカル環境で動作確認
6. プロンプトの調整（抽出精度向上）
7. エラーハンドリングの強化

### フェーズ3: 最適化（オプション）
8. 並列度の調整
9. キャッシュ機構の追加
10. クエリパラメータのサポート

## 11. 環境変数チェックリスト

実装前に以下の環境変数が設定されているか確認：

```bash
# 必須
FIRECRAWL_KEY="your_key"
OPENAI_KEY="your_key"  # または FIREWORKS_KEY

# 推奨
FIRECRAWL_CONCURRENCY="3"  # 並列度
CONTEXT_SIZE="128000"      # コンテキストサイズ
PORT="3051"                # APIポート
```

## 12. 既存機能との互換性

### 影響なし
- `POST /api/research` - そのまま動作
- `POST /api/generate-report` - そのまま動作
- `src/deep-research.ts` - 変更なし
- `src/run.ts` - 変更なし（CLI機能）

### 新規追加のみ
- `GET /conferences` - 新規エンドポイント
- `src/conference-research.ts` - 新規ファイル
- `src/types/conference.ts` - 新規ファイル
