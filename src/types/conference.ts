import { z } from 'zod';

/**
 * 学会・カンファレンス情報の型定義
 */
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
  read_status: string;             // 固定値: 空文字
  labels: string[];                // 固定値: 空配列
  tags: string[];                  // 固定値: 空配列
}

/**
 * Conference用のZodスキーマ
 */
export const ConferenceSchema = z.object({
  link: z.string().describe('学会公式サイトのURL'),
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
  date: z.string().describe('データ取得日時 (ISO 8601形式)'),
  read_status: z.literal('').describe('読了ステータス（固定値: 空文字）'),
  labels: z.array(z.string()).describe('ラベル（固定値: 空配列）'),
  tags: z.array(z.string()).describe('タグ（固定値: 空配列）'),
});

/**
 * API レスポンス用のZodスキーマ
 */
export const ConferencesResponseSchema = z.object({
  conferences: z.array(ConferenceSchema).describe('学会・カンファレンス情報の配列'),
});

/**
 * Zodスキーマから型を推論
 */
export type ConferenceFromSchema = z.infer<typeof ConferenceSchema>;
export type ConferencesResponse = z.infer<typeof ConferencesResponseSchema>;
